// Works out the labels (genres, decade, language, mood/occasion tags) of every song from hand-written data:
// artist-level facts, title/artist/channel rules, per-song years and curated tag lists. Pure, so it is unit-testable;
// `scripts/label.ts` loads the JSON files in `data/` and calls it. Anything the data doesn't know stays unlabeled.

import type { AnyCatalog, Catalog } from "./types.ts";
import { DECADE_IDS, DECADE_START, GENRE_IDS, LANGUAGE_IDS, TAG_IDS, decadeOfYear } from "./taxonomy.ts";

/** Artists sharing the same genres/language/decade. `Name@80s` overrides the decade for that artist. */
export type ArtistGroup = { g: string[]; l?: string; d?: string; m?: string[]; a: string[] };

/** A regex rule: any song whose text matches gets these labels. */
export type Rule = { re: string; g?: string[]; m?: string[]; l?: string; d?: string };

export type LabelData = {
  artists: ArtistGroup[];
  rules: {
    /** Tested against the song title. */
    title: Rule[];
    /** Tested against the artist name. */
    artist: Rule[];
    /** Keyed by channel name. */
    channel: Record<string, { g?: string[]; m?: string[] }>;
    /** Tags every song of these artists gets. */
    artistTags: Array<{ m: string[]; a: string[] }>;
  };
  /** Release year of specific songs: artist -> title -> year. */
  years: Record<string, Record<string, number>>;
  /** Curated lists: tag id -> ["Artist|Title", ...]. An entry without `|` is a whole artist. */
  tags: Record<string, string[]>;
};

export type SongInput = { title: string; artist: string | null; channel: string };
export type SongLabels = {
  /** Genre ids, most specific first, at most 3. */
  g: string[];
  /** Decade start year / 10 (199 = the 1990s), 0 = unknown. */
  y: number;
  /** ISO 639-1 language code, "" = unknown. */
  l: string;
  /** Mood / occasion / feature tag ids. */
  m: string[];
};

const MAX_GENRES = 3;
const MAX_TAGS = 6;

/** Lowercase, no accents, "&" as "and", only letters/digits and single spaces. */
export function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

/** Title without "(feat. X)", "(from ...)", "[...]" and "ft. X" tails. */
function titleNorm(title: string): string {
  return norm(
    title
      .replace(/[([][^)\]]*[)\]]/g, " ")
      .replace(/\s+(?:ft|feat)\.?\s.*$/i, "")
      .replace(/\s+from\s+".*$/i, ""),
  );
}

const SPLIT = /\s+(?:ft\.?|feat\.?|featuring|with|x|vs\.?)\s+|\s*[,;/]\s*|\s+&\s+|\s+and\s+|\s+\+\s+/i;

/** Names to look an artist up by: the full credit, then the lead artist (before "ft.", "&", ","). */
function artistCandidates(artist: string): string[] {
  const out = [norm(artist)];
  const first = norm(artist.split(SPLIT)[0] ?? "");
  if (first && !out.includes(first)) out.push(first);
  return out;
}

const keepKnown = (ids: string[] | undefined, known: Set<string>, what: string, where: string) => {
  for (const id of ids ?? []) if (!known.has(id)) throw new Error(`unknown ${what} "${id}" in ${where}`);
  return ids ?? [];
};

type ArtistInfo = { g: string[]; l: string; d: string; m: string[] };

export type Labeler = (song: SongInput) => SongLabels;

export function createLabeler(data: LabelData): Labeler {
  // Artist table. First group an artist appears in decides language and decade; genres accumulate.
  const artists = new Map<string, ArtistInfo>();
  data.artists.forEach((group, gi) => {
    const where = `artists group ${gi} (${group.g[0]})`;
    keepKnown(group.g, GENRE_IDS, "genre", where);
    keepKnown(group.m, TAG_IDS, "tag", where);
    if (group.l && !LANGUAGE_IDS.has(group.l)) throw new Error(`unknown language ${group.l} in ${where}`);
    if (group.d && !DECADE_IDS.has(group.d)) throw new Error(`unknown decade ${group.d} in ${where}`);
    for (const raw of group.a) {
      const at = raw.lastIndexOf("@");
      const hasDecade = at > 0 && DECADE_IDS.has(raw.slice(at + 1));
      const name = hasDecade ? raw.slice(0, at) : raw;
      const key = norm(name);
      const own = hasDecade ? raw.slice(at + 1) : group.d ?? "";
      const info = artists.get(key);
      if (!info) {
        artists.set(key, { g: [...group.g], l: group.l ?? "", d: own, m: [...(group.m ?? [])] });
      } else {
        for (const g of group.g) if (!info.g.includes(g)) info.g.push(g);
        for (const m of group.m ?? []) if (!info.m.includes(m)) info.m.push(m);
        if (!info.l && group.l) info.l = group.l;
        if (!info.d && own) info.d = own;
      }
    }
  });

  const compile = (rules: Rule[], where: string) =>
    rules.map((r) => {
      keepKnown(r.g, GENRE_IDS, "genre", where);
      keepKnown(r.m, TAG_IDS, "tag", where);
      return { ...r, rx: new RegExp(r.re, "iu") };
    });
  const titleRules = compile(data.rules.title, "title rules");
  const artistRules = compile(data.rules.artist, "artist rules");

  const artistTags = new Map<string, string[]>();
  for (const grp of data.rules.artistTags) {
    keepKnown(grp.m, TAG_IDS, "tag", "artistTags");
    for (const a of grp.a) {
      const k = norm(a);
      artistTags.set(k, [...(artistTags.get(k) ?? []), ...grp.m]);
    }
  }

  // Curated tags: by artist, or by exact artist|title.
  const tagsBySong = new Map<string, string[]>();
  const tagsByArtist = new Map<string, string[]>();
  for (const [tag, entries] of Object.entries(data.tags)) {
    keepKnown([tag], TAG_IDS, "tag", "tags.json");
    for (const e of entries) {
      const bar = e.indexOf("|");
      const map = bar < 0 ? tagsByArtist : tagsBySong;
      const key = bar < 0 ? norm(e) : `${norm(e.slice(0, bar))}|${titleNorm(e.slice(bar + 1))}`;
      map.set(key, [...(map.get(key) ?? []), tag]);
    }
  }

  const years = new Map<string, number>();
  for (const [artist, songs] of Object.entries(data.years)) {
    for (const [title, year] of Object.entries(songs)) years.set(`${norm(artist)}|${titleNorm(title)}`, year);
  }

  const ES_STRONG = /[ñ¿¡]|[áéíóú]/iu;
  const ES_WORDS = /\b(amor|corazon|mi|tu|te|que|con|para|por|una|el|la|los|las|yo|vida|quiero|siento|besos|noche|cielo|ojos|sin|contigo|bailar|mujer|dame|dime|cuando|donde|nada|todo|siempre|mas|eres|estoy|soy|ella|como|hoy|cancion|boda|feliz|navidad)\b/giu;
  const EN_WORDS = /\b(the|you|your|love|baby|girl|night|heart|my|im|dont|cant|its|with|that|this|all|one|just|when|what|me|and|of|in|to|is|i|a)\b/giu;
  const guessLanguage = (title: string): string => {
    const plain = norm(title);
    const es = plain.match(ES_WORDS)?.length ?? 0;
    const en = plain.match(EN_WORDS)?.length ?? 0;
    if (ES_STRONG.test(title) && es >= 1) return "es";
    if (es >= 2 && es > en) return "es";
    if (en >= 2 && en > es) return "en";
    return "";
  };

  return (song) => {
    const genres: string[] = [];
    const tags: string[] = [];
    const addG = (list?: string[]) => {
      for (const g of list ?? []) if (!genres.includes(g)) genres.push(g);
    };
    const addM = (list?: string[]) => {
      for (const m of list ?? []) if (!tags.includes(m)) tags.push(m);
    };

    let language = "";
    let decade = "";
    const candidates = song.artist ? artistCandidates(song.artist) : [];
    const info = candidates.map((c) => artists.get(c)).find(Boolean);
    const knownArtist = !!info;
    if (info) {
      addG(info.g);
      addM(info.m);
      language = info.l;
      decade = info.d;
    }
    const artistKey = candidates.find((c) => artists.has(c)) ?? candidates[0] ?? "";

    // Rules on title, artist name, channel: text-based hints, they come first when they are specific (Christmas, Disney...).
    const ruleGenres: string[] = [];
    for (const r of titleRules) {
      if (!r.rx.test(song.title)) continue;
      for (const g of r.g ?? []) if (!ruleGenres.includes(g)) ruleGenres.push(g);
      addM(r.m);
      if (r.l && !knownArtist) language = r.l;
      if (r.d && !decade) decade = r.d;
    }
    if (song.artist) {
      for (const r of artistRules) {
        if (!r.rx.test(song.artist)) continue;
        for (const g of r.g ?? []) if (!ruleGenres.includes(g)) ruleGenres.push(g);
        addM(r.m);
        if (r.l && !language) language = r.l;
        if (r.d && !decade) decade = r.d;
      }
    }
    const ch = data.rules.channel[song.channel];
    if (ch) {
      for (const g of ch.g ?? []) if (!ruleGenres.includes(g)) ruleGenres.push(g);
      addM(ch.m);
    }
    const merged = [...ruleGenres, ...genres.filter((g) => !ruleGenres.includes(g))];

    // Year of the song, then curated tags.
    const titleKey = titleNorm(song.title);
    const full = song.artist ? norm(song.artist) : "";
    const year = [full, artistKey, ...candidates].map((a) => years.get(`${a}|${titleKey}`)).find((y) => y !== undefined);
    if (year !== undefined) decade = decadeOfYear(year);
    for (const a of candidates) {
      addM(artistTags.get(a));
      addM(tagsByArtist.get(a));
      addM(tagsBySong.get(`${a}|${titleKey}`));
    }
    if (!song.artist) addM(tagsBySong.get(`|${titleKey}`));

    if (!language && !knownArtist) language = guessLanguage(song.title);
    else if (language === "en" && ES_STRONG.test(song.title) && (norm(song.title).match(ES_WORDS)?.length ?? 0) >= 2) language = "es";

    // Derived tags.
    const has = (...ids: string[]) => merged.some((g) => ids.includes(g));
    if (tags.includes("power-ballad") && !tags.includes("ballad")) tags.push("ballad");
    if (tags.includes("wedding") && !tags.includes("romantic")) tags.push("romantic");
    if (has("christmas", "carols") && !tags.includes("christmas")) tags.push("christmas");
    if (has("kids", "nursery-rhyme") && !tags.includes("kids-family")) tags.push("kids-family");
    if (has("disney") && !tags.includes("movie")) tags.push("movie");
    if (has("soundtrack") && !tags.includes("movie")) tags.push("movie");
    if (has("tv-theme") && !tags.includes("tv")) tags.push("tv");
    if (has("dance", "disco", "eurodance", "edm", "house", "reggaeton", "latin-urban", "salsa", "merengue", "cumbia", "banda", "dancehall") && !tags.includes("party")) tags.push("party");
    if (has("balada", "bolero") && !tags.includes("ballad")) tags.push("ballad");
    if (/\b(duet|duo|dúo)\b/iu.test(song.title) && !tags.includes("duet")) tags.push("duet");
    if (song.artist && /\s(?:ft\.?|feat\.?|featuring|with|&|and)\s/iu.test(song.artist) && has("pop", "country", "rnb", "soul", "latin-pop", "balada") && !tags.includes("duet-friendly") && /\b&\b|\band\b/iu.test(song.artist) && !/\b(band|brothers|sisters|company|sons)\b/iu.test(song.artist)) tags.push("duet-friendly");
    // Easy/medium/hard are mutually exclusive: keep the first one set.
    const diff = tags.filter((t) => t === "easy" || t === "medium" || t === "hard");
    if (diff.length > 1) for (const t of diff.slice(1)) tags.splice(tags.indexOf(t), 1);

    return {
      g: merged.slice(0, MAX_GENRES),
      y: decade ? DECADE_START[decade]! / 10 : 0,
      l: language,
      m: tags.slice(0, MAX_TAGS),
    };
  };
}

/** Re-label an existing catalog (v1 or v2) and return it as v2. Used when the raw YouTube data isn't at hand. */
export function labelCatalog(catalog: AnyCatalog, labeler: Labeler): Catalog {
  const genres: string[] = [];
  const tags: string[] = [];
  const intern = (list: string[], id: string) => {
    const i = list.indexOf(id);
    return i >= 0 ? i : list.push(id) - 1;
  };
  const { songs } = catalog;
  const cols = { g: [] as number[][], y: [] as number[], l: [] as string[], m: [] as number[][] };
  for (let i = 0; i < songs.t.length; i++) {
    const a = songs.a[i]!;
    const labels = labeler({ title: songs.t[i]!, artist: a >= 0 ? catalog.artists[a]! : null, channel: catalog.channels[songs.c[i]!] ?? "" });
    cols.g.push(labels.g.map((id) => intern(genres, id)));
    cols.y.push(labels.y);
    cols.l.push(labels.l);
    cols.m.push(labels.m.map((id) => intern(tags, id)));
  }
  return {
    v: 2,
    built: catalog.built,
    channels: catalog.channels,
    artists: catalog.artists,
    genres,
    tags,
    songs: { t: songs.t, a: songs.a, id: songs.id, d: songs.d, c: songs.c, p: songs.p, ...cols },
    alts: catalog.alts,
  };
}
