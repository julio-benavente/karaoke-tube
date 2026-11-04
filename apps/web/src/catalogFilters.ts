import { BROWSE_PRESETS } from "@karaoke-tube/ui";
import { DECADES, GENRES, LANGUAGES, TAGS } from "@karaoke-tube/catalog";
import type { BrowseFilter } from "@karaoke-tube/shared";

/** What the Filters sheet can narrow by. Several values of one kind mean "any"; tags mean "all". */
export type Filters = { genre: string[]; decade: string[]; language: string[]; tag: string[]; artist: string[] };
export type FilterKind = keyof Filters;

export const NO_FILTERS: Filters = { genre: [], decade: [], language: [], tag: [], artist: [] };

/** Address parameter of each kind: `?genre=rock&decade=80s&lang=es&tag=party&artist=Queen`. */
const PARAM: Record<FilterKind, string> = { genre: "genre", decade: "decade", language: "lang", tag: "tag", artist: "artist" };

export const hasFilters = (f: Filters) => Object.values(f).some((v) => v.length > 0);
export const countFilters = (f: Filters) => Object.values(f).reduce((n, v) => n + v.length, 0);

export function parseFilters(params: URLSearchParams): Filters {
  const out: Filters = { genre: [], decade: [], language: [], tag: [], artist: [] };
  for (const kind of Object.keys(PARAM) as FilterKind[]) {
    // Artist names can contain commas ("Earth, Wind & Fire"), so they repeat the parameter; the rest are lists.
    const values = kind === "artist" ? params.getAll(PARAM[kind]) : (params.get(PARAM[kind]) ?? "").split(",");
    out[kind] = values.map((v) => v.trim()).filter(Boolean);
  }
  // Older links used `?b=<category>`.
  const b = params.get("b");
  if (b && !hasFilters(out)) {
    const preset = BROWSE_PRESETS.find((p) => p.id === b);
    if (preset) return fromBrowseFilter(preset.filter);
  }
  return out;
}

export function writeFilters(params: URLSearchParams, f: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("b");
  for (const kind of Object.keys(PARAM) as FilterKind[]) {
    next.delete(PARAM[kind]);
    if (kind === "artist") f.artist.forEach((a) => next.append(PARAM.artist, a));
    else if (f[kind].length) next.set(PARAM[kind], f[kind].join(","));
  }
  return next;
}

const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
export const fromBrowseFilter = (b: BrowseFilter): Filters => ({
  genre: asList(b.genre),
  decade: asList(b.decade),
  language: asList(b.language),
  tag: asList(b.tag),
  artist: asList(b.artist),
});
export const toBrowseFilter = (f: Filters): BrowseFilter | undefined => (hasFilters(f) ? { ...f } : undefined);

/** Display name of a filter value, in the app's language. */
export function filterLabel(kind: FilterKind, id: string, lang: "en" | "es"): string {
  if (kind === "artist") return id;
  const list = kind === "genre" ? GENRES : kind === "decade" ? DECADES : kind === "language" ? LANGUAGES : TAGS;
  const found = list.find((x) => x.id === id);
  return found ? found[lang] : id;
}
