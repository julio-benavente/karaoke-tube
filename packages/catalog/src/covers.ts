/**
 * Album covers as shipped to browsers (`covers.json`), a sidecar of `catalog.json` made by scripts/covers.ts.
 * Covers are hotlinked from the source's CDN (Apple, Deezer); no image files are stored.
 *
 * `c` has one entry per catalog song, by song index. That ties the file to one exact catalog build, so it records the
 * catalog's `built` timestamp and song count, and `createCovers` returns null (the app then shows its generated cards)
 * when they do not match the catalog that was loaded. A catalog rebuild can therefore never show the wrong covers.
 */
export const COVERS_URL = "/catalog/covers.json";

export type CoversFile = {
  v: 1;
  /** ISO timestamp of this file. */
  built: string;
  /** `built` of the catalog.json these covers were made for, and its number of songs. */
  catalogBuilt: string;
  songCount: number;
  /** URL templates by source key, with {p} (the art's unique part) and {size} (pixels), e.g. https://host/image/thumb/{p}/{size}x{size}bb.jpg. */
  sources: Record<string, string>;
  /** Unique artworks: `s` = key into `sources`, `p` = the unique part of the URL. */
  art: Array<{ s: string; p: string }>;
  /** Per catalog song index: index into `art`, or -1 for no cover. */
  c: number[];
};

/** What identifies a catalog build. */
export type CatalogStamp = { built: string; songCount: number };

export type Covers = {
  /** Songs that have a cover. */
  count: number;
  has(songIndex: number): boolean;
  /** Cover URL at `size` pixels (square, default 300), or null when the song has none. */
  url(songIndex: number, size?: number): string | null;
};

const MIN_SIZE = 16;
const MAX_SIZE = 1000;

/** Build a cover URL from a template and the artwork's unique part. */
export function artworkUrl(template: string, p: string, size = 300): string {
  const px = String(Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))));
  return template.replace("{p}", p).replaceAll("{size}", px);
}

function isCoversFile(f: unknown): f is CoversFile {
  if (!f || typeof f !== "object") return false;
  const o = f as Partial<CoversFile>;
  return o.v === 1 && typeof o.catalogBuilt === "string" && typeof o.songCount === "number" && !!o.sources && Array.isArray(o.art) && Array.isArray(o.c);
}

/** The covers for this catalog, or null when the file is invalid or was made for a different catalog build. */
export function createCovers(file: unknown, catalog: CatalogStamp): Covers | null {
  if (!isCoversFile(file)) return null;
  if (file.catalogBuilt !== catalog.built || file.songCount !== catalog.songCount || file.c.length !== catalog.songCount) return null;
  const { sources, art, c } = file;
  const count = c.reduce((n, a) => (a >= 0 ? n + 1 : n), 0);
  const url = (i: number, size?: number): string | null => {
    const a = art[c[i] ?? -1];
    const template = a ? sources[a.s] : undefined;
    return a && template ? artworkUrl(template, a.p, size) : null;
  };
  return { count, has: (i) => (c[i] ?? -1) >= 0 && url(i) !== null, url };
}

export type LoadCoversOptions = { url?: string; fetchFile?: (url: string) => Promise<unknown> };

/** Fetch covers.json and check it against the loaded catalog. Never throws: any failure means "no covers" (null). */
export async function loadCovers(catalog: CatalogStamp, options: LoadCoversOptions = {}): Promise<Covers | null> {
  const { url = COVERS_URL, fetchFile = async (u: string) => (await fetch(u)).json() as Promise<unknown> } = options;
  try {
    return createCovers(await fetchFile(url), catalog);
  } catch {
    return null;
  }
}
