// Turns a karaoke video title into clean parts: strips the "(Karaoke Version)", "| KaraFun", "Lower Higher Female
// Original Key", hashtags, emoji and promo text, then splits what's left into its "Artist - Song" pieces.
// Every channel words this differently, so the order (artist first or song first) is decided by `orient()`.

/** Which side the artist is on in a channel's titles. `mixed`: both, decide per title. */
export type Order = "artist-song" | "song-artist" | "mixed";
/** A rule inside the title itself (`Song in the style of Artist`, `"Song" from Show`, `Song : Artist`) fixed the order. */
export type Ordered = "artist-first" | "song-first" | null;

export type ParsedTitle = {
  /** The pieces left after cleaning, in title order. One piece = no artist found. */
  segments: string[];
  ordered: Ordered;
  /** "piano", "lower key", "higher key", "male key", "vocal guide"... empty for the normal original-key version. */
  variant: string;
};

const EMOJI_ANY = /\p{Extended_Pictographic}/u;
const EMOJI_ALL = /[\p{Extended_Pictographic}️‍]/gu;

/** Bracketed text that is only karaoke boilerplate. Anything else in brackets, e.g. (Dance Mix), (Live), stays. */
const BRACKET_NOISE =
  /karaoke|\bcoros\b|instrumental|lyrics|letra|vocal guide|studio version|no lead vocal|backing track|sing[- ]?along|minus one|sing with me|\blower\b|\bhigher\b|\b(?:male|female)(?:\s+key)?\b|original key|(?:lower|higher) key|\bpiano\b|\bhd\b|\b4k\b|\bofficial\b|\b[a-g][b#♭♯]?\s*(?:major|minor)\b|^\s*[+-]?\d+\s*$|\blow(?:er)?\s*[+-]?\d+|\b(?:with|without)\s+(?:backing|lead)\s+vocals?/i;

/** A segment made only of these words is boilerplate ("Karaoke Version", "With Lyrics HD Vocal-Star Karaoke 4K"). */
const NOISE_WORD = String.raw`(?:karaoke|instrumental(?:es)?|version|track|video|shorts?|lyrics?|letra|vocal|guide|studio|lead|backing|piano|hd|4k|official|lower|higher|male|female|original|key|with|on|screen|sing|along|singalong|me|y|no|karafun|vocal-?star|[+-]\d+)`;
const FULL_NOISE = new RegExp(String.raw`^(?:${NOISE_WORD}[\s&+,/]*)+$`, "i");
/** At least one of these must be present for FULL_NOISE to count, so a song called "Me" or "No" survives. */
const STRONG_NOISE =
  /karaoke|instrumental|lyrics?|letra|vocal[ -]?guide|backing|piano|karafun|vocal-?star|original key|sing[ -]?along|sing with me|studio|\bhd\b|\b4k\b/i;
/** Key labels that trail some titles from the third piece on ("... - Karaoke Instrumental - Bajo"). */
const KEY_LABELS = /^(?:(?:bajo|alto|medio|mujer|hombre|tono|femenino|masculino|original|arreglo|male|female)[\s&+,/]*)+$/i;
const BRAND =
  /^(?:sing king(?: karaoke)?|party tyme(?: karaoke)?|stingray(?: karaoke)?|sing2piano|curtainup(?: karaoke)?|vocal[- ]star(?: karaoke)?|puro mariachi(?: karaoke)?|karsing(?: karaoke)?|canto karaoke|karaoke latino|pantalla vertical)$/i;

/**
 * Boilerplate words hanging off the end of a piece: "Make You Mine Karaoke Instrumental Lower Higher Male & Original Key".
 * A tail must START with a word that can only be boilerplate. Words like "Higher", "Male" or "Key" are also real song
 * words ("Carly Rae Jepsen - Higher"), so they only count once a clear boilerplate word has begun the tail.
 */
const CLEAR_TAIL_WORD = String.raw`(?:with\s+lyrics|lyrics\s+on\s+screen|on\s+screen|vocal\s+guide|no\s+lead\s+vocal|karaoke\s+(?:version|track|video|short|with\s+lyrics)|studio\s+version|backing\s+track|(?:with|without)\s+(?:backing|lead)\s+vocals?|piano\s+karaoke|karaoke\s+piano|karaoke\s+songs?|versi[oó]ne?\s+karaoke|original\s+key|karaoke|instrumental|lyrics?|letra|hd|4k|vocal-?star|karafun)`;
const TAIL_WORD = String.raw`(?:${CLEAR_TAIL_WORD}|piano|lower|higher|male|female|original|key|and|&|[+-]\d+)`;
const TAIL = new RegExp(String.raw`(?:^|\s+)${CLEAR_TAIL_WORD}(?:\s+${TAIL_WORD})*\s*$`, "i");
/** The tail is only cut when it really contains karaoke wording, so "Skeleton Key" or "Rock & Roll" stay whole. */
const TAIL_GATE = /karaoke|instrumental|lyrics?|letra|piano|lower|higher|original\s+key|vocal\s+guide|studio|backing|lead\s+vocal|\bhd\b|4k/i;

function stripTail(s: string): string {
  const m = TAIL.exec(s);
  return m && TAIL_GATE.test(m[0]) ? s.slice(0, m.index) : s;
}

function unquote(s: string): string {
  let out = s.replace(/^["]+|["]+$/g, "").trim();
  const m = /^'(.+)'$/.exec(out);
  if (m) out = m[1]!;
  return out.replace(/^[\s\-–—:,.]+|[\s\-–—:,]+$/g, "").trim();
}

export function detectVariant(raw: string): string {
  const parts: string[] = [];
  const lower = /\blower\b/i.test(raw);
  const higher = /\bhigher\b/i.test(raw);
  const original = /original\s+key/i.test(raw);
  if (/\bpiano\b/i.test(raw)) parts.push("piano");
  if (!original) {
    if (lower && higher) parts.push("all keys");
    else if (lower) parts.push("lower key");
    else if (higher) parts.push("higher key");
    else if (/\bfemale\b/i.test(raw)) parts.push("female key");
    else if (/\bmale\b/i.test(raw)) parts.push("male key");
  }
  if (/vocal guide/i.test(raw)) parts.push("vocal guide");
  return parts.join(", ");
}

export type ParseOptions = {
  /** `Song: Artist` (no spaces before the colon) separates the two. Stingray. */
  colonSplit?: boolean;
  /** `Song Karaoke Artist Instrumental ...` with no dashes: the word Karaoke is the separator. Karaoke All Keys. */
  karaokeSplit?: boolean;
  /** Titles start with the word Karaoke ("Karaoke - Song - Artist", "Karaoke Song - Artist *"). KaraFun España. */
  karaokePrefix?: boolean;
};

export function parseTitle(raw: string, opts: ParseOptions = {}): ParsedTitle {
  const variant = detectVariant(raw);
  let t = raw
    .normalize("NFC")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’´`]/g, "'");

  // Promo text usually follows an emoji ("... (Karaoke Piano) 🎄 Green Screen Yourself..."): cut there.
  const emoji = t.search(EMOJI_ANY);
  if (emoji > 0) t = t.slice(0, emoji);
  t = t
    .replace(EMOJI_ALL, " ")
    // Hashtags at the very end are promo; one after a dash is part of the title ("The Chainsmokers - #Selfie").
    .replace(/(?<=[\p{L}\p{N})\]!?.'"])(?:\s+#[\p{L}\p{N}_]+)+\s*$/u, " ")
    .replace(/@[\w.]+/g, " ")
    .replace(/\bISRC:?\s*\S+/gi, " ");

  // Karaoke Rudissimo ends titles with "(Version Karaoke Profesional)", sometimes with a bracket missing or the text cut
  // off ("... Version Karaoke Profesional)", "... (Version Karaoke Profesion"). Cut from "Version Karaoke" to the end.
  t = t.replace(/\s*\(?\s*versi[oó]n\s+karaoke\b[^-–—|]*$/i, "");
  // Drop boilerplate brackets, keep meaningful ones. Twice, for one level of nesting.
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s*[(\[{]([^()\[\]{}]*)[)\]}]/g, (m, inner: string) => (BRACKET_NOISE.test(inner) ? " " : m));
  }
  t = t.replace(/\s+/g, " ").trim();
  // KaraFun marks its premium tracks with a trailing asterisk.
  t = t.replace(/\s*\*+$/, "");
  if (opts.karaokePrefix) t = t.replace(/^karaoke\s*[-–:,]?\s+(?=\S)/i, "");

  // "Song : Artist" (Stingray) has the song first.
  let ordered: Ordered = null;
  let parts: string[];
  if (/\s+:\s+/.test(t) && !/\s+[-–—]\s+/.test(t)) {
    ordered = "song-first";
    parts = t.split(/\s+:\s+|\s*\|\s*/);
  } else {
    parts = t.split(/\s+[-–—]\s+|\s*\|\s*/);
  }

  if (opts.karaokeSplit && parts.length === 1) {
    const m = /^(.+?)\s+karaoke\s+(?!(?:version|instrumental|track|video|short|with|lyrics|piano|studio)\b)(\S.*)$/i.exec(parts[0]!);
    if (m) {
      parts = [m[1]!, m[2]!];
      ordered = "song-first";
    }
  }

  let segs: string[] = [];
  let songFirstCue = false;
  parts.forEach((part, i) => {
    const trimmed = part.trim();
    const s = stripTail(trimmed).trim();
    // "Mr. Roboto Karaoke | Styx Karaoke Version", "TOUCH Karaoke - keshi Instrumental ...": a bare Karaoke
    // after the FIRST piece marks it as the song, whatever order the channel usually uses.
    if (i === 0 && parts.length >= 2 && s && /^\s*(?:piano\s+)?karaoke\s*$/i.test(trimmed.slice(stripTail(trimmed).length))) {
      songFirstCue = true;
    }
    if (!s) return;
    if (BRAND.test(s)) return;
    if (STRONG_NOISE.test(s) && FULL_NOISE.test(s)) return;
    if (i >= 1 && /^tono\s+\p{L}+$/iu.test(s)) return;
    if (i >= 2 && (FULL_NOISE.test(s) || KEY_LABELS.test(s) || /karaoke|instrumental|lyrics/i.test(s))) return;
    segs.push(s);
  });

  if (opts.colonSplit && segs.length === 1) {
    const m = /^(.+?):\s+(.+)$/.exec(segs[0]!);
    if (m) segs = [m[1]!, m[2]!];
  }

  if (songFirstCue && !ordered) ordered = "song-first";

  // "Song in the style of Artist" (Stingray).
  const styled: string[] = [];
  for (const s of segs) {
    const m = /^(.+?)\s+in\s+the\s+style\s+of\s+(.+)$/i.exec(s);
    if (m) {
      styled.push(m[1]!, m[2]!);
      ordered = "song-first";
    } else styled.push(s);
  }
  segs = styled;

  // `"Song" from Show` / `"Song" by Artist` (CurtainUp).
  if (segs.length === 1) {
    const m = /^"(.+?)"(\s*\([^)]*\))?\s+(?:from|by)\s+(.+)$/i.exec(segs[0]!);
    if (m) {
      segs = [m[1]! + (m[2] ?? ""), m[3]!];
      ordered = "song-first";
    }
  }

  return { segments: segs.map(unquote).filter(Boolean), ordered, variant };
}

/**
 * ALL-CAPS text ("SPOLIARIUM") becomes "Spoliarium"; anything with lowercase letters is left alone. Only used for
 * channels that shout every title: a lone "IDGAF" or "ABBA" elsewhere is meant to be caps.
 */
export function tidyCase(s: string): string {
  if (/[a-z]/.test(s) || !/[A-Z]{2}/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(\-"/])([a-zà-ÿ])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
}

export type Oriented = { artist: string | null; title: string; certain: boolean };

/**
 * Decides which pieces are the artist and which the song. `artistScore(name)` is how many times a name has been
 * seen as an artist in titles whose order is known; it settles `mixed` channels.
 */
export function orient(
  p: ParsedTitle,
  order: Order,
  artistScore: (name: string) => number = () => 0,
  { tidy = false, prefer = "artist-first" }: { tidy?: boolean; prefer?: "artist-first" | "song-first" } = {},
): Oriented {
  const fix = tidy ? tidyCase : (s: string) => s;
  const segs = p.segments;
  if (segs.length === 0) return { artist: null, title: "", certain: true };
  if (segs.length === 1) return { artist: null, title: fix(segs[0]!), certain: true };

  const effective: Order = p.ordered === "song-first" ? "song-artist" : p.ordered === "artist-first" ? "artist-song" : order;
  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  const middle = segs.slice(1).join(" - ");
  const init = segs.slice(0, -1).join(" - ");

  const artistFirst = (): Oriented => ({ artist: fix(first), title: fix(middle), certain: effective !== "mixed" });
  const songFirst = (): Oriented => ({ artist: fix(last), title: fix(init), certain: effective !== "mixed" });

  if (effective === "artist-song") return artistFirst();
  if (effective === "song-artist") return songFirst();

  const sa = artistScore(first);
  const sb = artistScore(last);
  if (sa > sb) return { ...artistFirst(), certain: true };
  if (sb > sa) return { ...songFirst(), certain: true };
  return { ...(prefer === "song-first" ? songFirst() : artistFirst()), certain: false };
}

/** Lowercase, no accents or punctuation, single spaces: the form two titles are compared in. */
export function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** "Rob Thomas & Santana" -> "rob thomas"; "The Beatles" -> "beatles": the artist half of a duplicate key. */
export function artistKey(name: string): string {
  const first = name.split(/\s*(?:,|&|\+|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b|\band\b)\s*/i)[0] ?? name;
  return normText(first).replace(/^the /, "");
}

/** The song half of a duplicate key: no "(feat. X)", accents or punctuation. */
export function titleKey(title: string): string {
  return normText(title.replace(/\s*[(\[]?\s*(?:feat\.?|ft\.?|featuring)\s.*$/i, ""));
}
