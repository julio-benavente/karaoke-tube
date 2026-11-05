// Matching rules for album-cover lookups (tooling for scripts/covers.ts; not shipped to browsers).
//
// A catalog song (clean-ish title + artist) is compared with up to 5 candidates a source returned. A candidate must pass
// three gates (no "wrong version" markers, same artist, close title); the survivors are scored and the best one wins, but
// only if its confidence reaches the threshold. Rather unmatched than a wrong cover.

/** One song a source found, in a source-independent shape. */
export type Candidate = {
  artist: string;
  title: string;
  album: string;
  /** Album artist, when the source says (iTunes: "Various Artists" marks a compilation). */
  albumArtist?: string;
  /** Release date (ISO) when the source gives one; Deezer's search results do not. */
  date?: string;
  /** Any size of the cover image URL (the source adapter turns it into a template + path). */
  image: string;
  /** Position in the source's own ranking (0 = first). */
  pos: number;
};

export type Match = {
  confidence: number;
  artist: string;
  title: string;
  album: string;
  image: string;
  /** Title / artist similarity, 0-1. */
  titleSim: number;
  artistSim: number;
};

/** A catalog song prepared for lookup. */
export type Song = {
  /** Artist as in the catalog (or taken from "Made Popular By X"). */
  artist: string;
  /** First artist of a list ("A, B" / "A feat. B"): what goes into the query. */
  head: string;
  /** Title without karaoke noise and "Made Popular By". Brackets kept. */
  title: string;
  /** Title for the query: brackets removed. */
  query: string;
  /** Artist + title, used to allow words (Live, Remix...) the catalog itself uses. */
  context: string;
};

export const DEFAULT_MIN_CONFIDENCE = 0.85;

// ---------------------------------------------------------------------------------------------------------------------
// Text helpers

/** Lowercase, no accents, "&" as "and", no apostrophes, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const squeeze = (s: string) => s.replace(/ /g, "");

/** Dice coefficient over character bigrams (0-1). */
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) grams.set(a.slice(i, i + 2), (grams.get(a.slice(i, i + 2)) ?? 0) + 1);
  let hit = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      hit++;
      grams.set(g, n - 1);
    }
  }
  return (2 * hit) / (a.length + b.length - 2);
}

const BRACKETS = /\([^)]*\)|\[[^\]]*\]/g;
const FEAT_TAIL = /\s+(?:feat\.?|ft\.?|featuring)\s.*$/i;
const VERSION_WORDS =
  "(?:\\d{4}\\s+)?(?:digital\\s+)?(?:remaster(?:ed)?|re-?master(?:ed)?|radio\\s+(?:edit|version|mix)|single\\s+version|album\\s+version|original\\s+version|mono|stereo|deluxe|bonus\\s+track|explicit|clean|edit|version)";
const VERSION_TAIL = new RegExp(`\\s+[-–—]\\s+${VERSION_WORDS}\\b.*$`, "i");
const VERSION_PREFIX = new RegExp(`\\s+[-–—]\\s+(?:\\d{4}\\s+)?(?:digital\\s+)?(?:remaster|re-?master)\\w*.*$`, "i");

/** A title reduced to what identifies the song: no brackets, "feat.", "- Remastered 2011", "- Radio Edit"... */
export function normalizeTitle(title: string): string {
  const strip = (s: string) => s.replace(FEAT_TAIL, "").replace(VERSION_PREFIX, "").replace(VERSION_TAIL, "");
  const noBrackets = strip(title.replace(BRACKETS, " ")).trim();
  const n = normalize(noBrackets);
  return n || normalize(strip(title));
}

/** Split an artist credit ("A & B", "A feat. B", "A, B", "A y B") into normalized names; the whole credit comes first. */
function artistNames(artist: string): string[] {
  const dropThe = (s: string) => s.replace(/^the /, "");
  const whole = dropThe(normalize(artist));
  const parts = artist
    .split(/\s*(?:,|\/|\+|&|\band\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\by\b|\bx\b|\bvs\.?|\be\b|\bet\b)\s*/i)
    .map((p) => dropThe(normalize(p)))
    .filter(Boolean);
  return [...new Set([whole, ...parts])];
}

export function artistSimilarity(catalogArtist: string, candidateArtist: string): number {
  const A = artistNames(catalogArtist);
  const B = artistNames(candidateArtist);
  if (!A[0] || !B[0]) return 0;
  if (A[0] === B[0] || squeeze(A[0]) === squeeze(B[0])) return 1;
  for (const a of A) for (const b of B) if (a.length >= 2 && (a === b || squeeze(a) === squeeze(b))) return 0.95;
  const wa = ` ${A[0]} `;
  const wb = ` ${B[0]} `;
  // "Adele" inside "Hello I'm Adele" or "Creedence Clearwater Revival" inside "...Revival Experience" is a different act
  // (a tribute band, a cover act): not enough on its own, so it scores below the gate.
  if (wb.includes(wa) || wa.includes(wb)) return 0.6;
  // A near-identical spelling is probably a typo ("Morrisette"), but also what "Creedence Clearwater Revived" (a cover act)
  // looks like. It counts as a match only at a capped 0.75: enough for an original album, not for a compilation.
  return dice(squeeze(A[0]), squeeze(B[0])) >= 0.85 ? 0.75 : 0;
}

export function titleSimilarity(catalogTitle: string, candidateTitle: string): number {
  const a = normalizeTitle(catalogTitle);
  const b = normalizeTitle(candidateTitle);
  if (!a || !b) return 0;
  if (a === b || squeeze(a) === squeeze(b)) return 1;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length >= 2 && long.length - short.length <= 3 && short.every((t, i) => long[i] === t)) return 0.9;
  return dice(squeeze(a), squeeze(b));
}

// ---------------------------------------------------------------------------------------------------------------------
// Catalog song -> lookup

const MADE_BY =
  /[(\[]\s*(?:as\s+)?(?:made\s+(?:popular|famous)|popularized|originally\s+(?:performed|recorded)|in\s+the\s+style\s+of)\s+by\s+(.+?)\s*[)\]]|\s+[-–]\s+(?:as\s+)?(?:made\s+(?:popular|famous)|originally\s+(?:performed|recorded)|in\s+the\s+style\s+of)\s+by\s+(.+)$/i;

/** Strip "Karaoke ...", "(Karaoke Version)", "Lyrics Instrumental Cover Original Key A" and the like. */
function stripKaraokeNoise(raw: string): string {
  let t = raw.trim();
  const had = /karaoke|instrumental/i.test(t);
  if (!had) return t;
  t = t.replace(/^\s*karaoke(?:\s+(?:version|video|track|instrumental))?\s*[-:–|]?\s*/i, "");
  t = t.replace(/\s*[-–|:(\[]?\s*(?:karaoke|instrumental|instumental)\b.*$/i, "");
  t = t.replace(/\s*[-–|(\[]?\s*(?:lyrics|with lyrics|original key|male key|female key|key of)\b.*$/i, "");
  return t.trim();
}

/** Prepare a catalog row for lookup. `null` + reason when nothing sensible can be searched. */
export function prepareSong(rawTitle: string, rawArtist: string | null): { song: Song } | { skip: string } {
  let title = rawTitle;
  let artist = rawArtist?.trim() ?? "";
  const made = MADE_BY.exec(title);
  if (made) {
    const by = (made[1] ?? made[2] ?? "").trim();
    title = title.replace(MADE_BY, " ");
    if (!artist) artist = by;
  }
  title = stripKaraokeNoise(title).replace(/\s{2,}/g, " ").trim();
  if (!artist) return { skip: "no-artist" };
  if (!title || !normalize(title)) return { skip: "empty-title" };
  const head = artist.split(/\s*(?:,|\/|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/i)[0]?.trim() || artist;
  const query = title.replace(BRACKETS, " ").replace(FEAT_TAIL, "").replace(/\s{2,}/g, " ").trim() || title;
  return { song: { artist, head, title, query, context: `${artist} ${title}` } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Wrong-version markers

type Field = "title" | "album" | "artist";
const MARKERS: Array<{ key: string; re: RegExp; fields: Field[] }> = [
  { key: "live", re: /[(\[]\s*(?:live|en vivo|en directo|ao vivo|en concierto|at|from)\b[^)\]]*(?:\d{4}|hall|garden|arena|stadium|theat(?:er|re)|festival|concert|live|vivo)|[(\[]\s*(?:live|en vivo|en directo|ao vivo|en concierto)\b|\blive (?:at|from|in|on|version|session|sessions|recording|performance|acoustic|album)\b|[-–]\s*live\b|\bin concert\b|\b(?:dinner|late|early|matinee|evening)\s+show\b|\brehearsal\b|\bouttake\b|\balternate take\b|\bdemo\b/i, fields: ["title"] },
  { key: "live", re: /\blive\b|\bin concert\b|\ben vivo\b|\ben directo\b|\bao vivo\b|\ben concierto\b|\bprimera fila\b|\bunplugged\b|\bconcierto\b|\bconcert\b/i, fields: ["album"] },
  {
    key: "karaoke",
    re: /karaoke|sing[- ]?a?long|backing tracks?|made (?:famous|popular) by|as made famous|in the style of|originally (?:performed|recorded)|as performed by|ameritz|sunfly|party tyme|stingray music|singers unlimited|hit crew|studio all-?stars/i,
    fields: ["title", "album", "artist"],
  },
  { key: "instrumental", re: /instrumental|\bminus one\b/i, fields: ["title", "album", "artist"] },
  {
    key: "tribute",
    re: /tribute|\bcovers?\b|cover version|vitamin string|string quartet|lullab(?:y|ies)|rockabye|music box|8[- ]?bit|piano (?:version|tribute|renditions?|covers?|solo|collection)|\bplays\b|\brenditions?\b|salute to|sound-?alike/i,
    fields: ["title", "album", "artist"],
  },
  { key: "remix", re: /[(\[][^)\]]*\b(?<!original |album |radio |single )mix\b|\brework(?:ed)?\b|\bre-?imagined\b|\bremix(?:es|ed)?\b|\bbootleg\b|\bmash[- ]?up\b|\bsped up\b|\bslowed\b|\bnightcore\b|\bre-?recorded\b/i, fields: ["title", "album"] },
];

/** The first wrong-version marker found in a candidate that the catalog song does not itself carry, or null. */
export function wrongVersion(c: Candidate, song: Song): string | null {
  for (const m of MARKERS) {
    const own = MARKERS.some((o) => o.key === m.key && o.re.test(song.context));
    if (own) continue;
    for (const f of m.fields) {
      const text = f === "title" ? c.title : f === "album" ? c.album : c.artist;
      if (m.re.test(text)) return m.key;
    }
  }
  return null;
}

const COMPILATION =
  /greatest hits|\bbest of\b|the very best|\bnow that'?s\b|anthology|\bcollection\b|\bessentials?\b|\bultimate\b|\bhits\b|\bgold\b|platinum|#1'?s|number ones|retrospective|love songs|\bclassics\b|the singles|\b(?:19|20)?\d0s\b|\bdecade\b|\btop \d+\b|\bparty\b|\bvarious\b|\bchart\b/i;
const SINGLE = /[-–(]\s*(?:single|ep)\b/i;

// ---------------------------------------------------------------------------------------------------------------------
// Scoring

export type Pick = {
  best: Match | null;
  /** Every candidate that passed the gates, best first (so a lower threshold can be tried without re-querying). */
  viable: Match[];
  /** Why there is no match (empty when there is one). */
  reason: string;
};

const GATE_ARTIST = 0.7;
const GATE_TITLE = 0.8;
const year = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

export function pickBest(song: Song, candidates: Candidate[], minConfidence = DEFAULT_MIN_CONFIDENCE): Pick {
  if (candidates.length === 0) return { best: null, viable: [], reason: "no results" };
  type Eval = { c: Candidate; t: number; a: number };
  const passed: Eval[] = [];
  let nearMiss: { rank: number; score: number; why: string } = { rank: -1, score: -1, why: "" };
  const miss = (rank: number, score: number, why: string) => {
    if (rank > nearMiss.rank || (rank === nearMiss.rank && score > nearMiss.score)) nearMiss = { rank, score, why };
  };
  for (const c of candidates) {
    const label = `"${c.title}" by ${c.artist} [${c.album}]`;
    const a = artistSimilarity(song.artist, c.artist);
    const t = titleSimilarity(song.title, c.title);
    const bad = wrongVersion(c, song);
    if (bad) {
      miss(0, a + t, `rejected ${bad}: ${label}`);
      continue;
    }
    if (a < GATE_ARTIST) {
      miss(1, a + t, `artist differs: ${label}`);
      continue;
    }
    if (t < GATE_TITLE) {
      miss(2, a + t, `title differs: ${label}`);
      continue;
    }
    passed.push({ c, t, a });
  }
  const years = passed.map((p) => year(p.c.date)).filter((y): y is number => y !== null);
  const earliest = years.length ? Math.min(...years) : null;
  const viable: Match[] = passed
    .map(({ c, t, a }) => {
      const compilation = COMPILATION.test(c.album) || /various/i.test(c.albumArtist ?? "");
      const type = compilation ? 0 : SINGLE.test(c.album) ? 1 : 0.7;
      const y = year(c.date);
      const early = y !== null && earliest !== null ? Math.max(0, 1 - (y - earliest) / 6) : 0.5;
      const confidence = 0.55 * t + 0.35 * a + 0.1 * (0.5 * type + 0.5 * early);
      return { m: { confidence, artist: c.artist, title: c.title, album: c.album, image: c.image, titleSim: t, artistSim: a }, pos: c.pos };
    })
    .sort((x, y) => y.m.confidence - x.m.confidence || x.pos - y.pos)
    .map((x) => x.m);
  const best = viable[0];
  if (!best) return { best: null, viable, reason: nearMiss.why };
  if (best.confidence < minConfidence) return { best: null, viable, reason: `low confidence ${best.confidence.toFixed(2)}: "${best.title}" by ${best.artist} [${best.album}]` };
  return { best, viable, reason: "" };
}
