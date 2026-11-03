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
};

const list = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Indexes of the songs matching `filter`, in catalog order (most popular first), at most `limit`. */
export function filterSongs(catalog: AnyCatalog, filter: SongFilter, limit = Infinity): number[] {
  const genres = list(filter.genre);
  const decades = list(filter.decade).map((d) => (DECADE_START[d] ?? -1) / 10);
  const languages = list(filter.language);
  const tags = list(filter.tag);
  const n = catalog.songs.t.length;
  const out: number[] = [];

  if (catalog.v === 1) {
    if (genres.length || decades.length || languages.length || tags.length) return out;
    for (let i = 0; i < n && out.length < limit; i++) out.push(i);
    return out;
  }

  // Which genre dictionary entries satisfy the genre filter (the entry itself or any ancestor is wanted).
  const genreOk = catalog.genres.map((id) => genreChain(id).some((g) => genres.includes(g)));
  // Tag dictionary indexes the song must carry.
  const need = tags.map((t) => catalog.tags.indexOf(t));
  if (need.includes(-1)) return out;

  const { g, y, l, m } = catalog.songs;
  for (let i = 0; i < n && out.length < limit; i++) {
    if (genres.length && !g[i]!.some((x) => genreOk[x])) continue;
    if (decades.length && !decades.includes(y[i]!)) continue;
    if (languages.length && !languages.includes(l[i]!)) continue;
    if (need.length && !need.every((t) => m[i]!.includes(t))) continue;
    out.push(i);
  }
  return out;
}
