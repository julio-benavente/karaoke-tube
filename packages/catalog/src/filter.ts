// Filtering the catalog by label: genre, decade, language, mood/occasion tag. Reads v1 catalogs too (they have no
// labels, so any label filter matches nothing and an empty filter matches everything).

import { DECADE_START, genreChain } from "./taxonomy";
import type { AnyCatalog } from "./types";

export type SongFilter = {
  /** Genre ids; a parent genre matches its sub-genres ("rock" matches "hard-rock"). Any of them. */
  genre?: string | string[];
  /** Decade ids ("90s"). Any of them. */
  decade?: string | string[];
  /** Language codes ("es"). Any of them. */
  language?: string | string[];
  /** Tag ids. All of them. */
  tag?: string | string[];
  /** Artist names, compared ignoring case and accents. Any of them. */
  artist?: string | string[];
};

const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Lowercase, no accents, no apostrophes: how artist names are compared. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Artist indexes by normalized name, built once per catalog. */
const artistLookup = new WeakMap<object, Map<string, number>>();
function artistIndexes(catalog: AnyCatalog): Map<string, number> {
  let m = artistLookup.get(catalog);
  if (!m) {
    m = new Map();
    catalog.artists.forEach((name, i) => m!.set(normalizeName(name), i));
    artistLookup.set(catalog, m);
  }
  return m;
}

/**
 * A yes/no test for one song (by index) against `filter`, or null when the filter is empty (everything matches).
 * v1 catalogs have no labels, so any label filter matches nothing; artist works on both.
 */
export function songMatcher(catalog: AnyCatalog, filter: SongFilter): ((i: number) => boolean) | null {
  const genres = list(filter.genre);
  const decades = list(filter.decade).map((d) => (DECADE_START[d] ?? -1) / 10);
  const languages = list(filter.language);
  const tags = list(filter.tag);
  const artists = list(filter.artist);
  if (!genres.length && !decades.length && !languages.length && !tags.length && !artists.length) return null;

  const artistOk = artists.length ? new Set(artists.map((a) => artistIndexes(catalog).get(normalizeName(a)) ?? -2)) : null;
  const { a: artistOf } = catalog.songs;
  const byArtist = (i: number) => !artistOk || artistOk.has(artistOf[i]!);

  if (catalog.v === 1) {
    if (genres.length || decades.length || languages.length || tags.length) return () => false;
    return byArtist;
  }

  // Which genre dictionary entries satisfy the genre filter (the entry itself or any ancestor is wanted).
  const genreOk = catalog.genres.map((id) => genreChain(id).some((g) => genres.includes(g)));
  // Tag dictionary indexes the song must carry.
  const need = tags.map((t) => catalog.tags.indexOf(t));
  if (need.includes(-1)) return () => false;
  const { g, y, l, m } = catalog.songs;
  return (i) =>
    byArtist(i) &&
    (!genres.length || g[i]!.some((x) => genreOk[x])) &&
    (!decades.length || decades.includes(y[i]!)) &&
    (!languages.length || languages.includes(l[i]!)) &&
    (!need.length || need.every((t) => m[i]!.includes(t)));
}

/** Indexes of the songs matching `filter`, in catalog order (most popular first), at most `limit`. */
export function filterSongs(catalog: AnyCatalog, filter: SongFilter, limit = Infinity): number[] {
  const match = songMatcher(catalog, filter);
  const n = catalog.songs.t.length;
  const out: number[] = [];
  for (let i = 0; i < n && out.length < limit; i++) if (!match || match(i)) out.push(i);
  return out;
}
