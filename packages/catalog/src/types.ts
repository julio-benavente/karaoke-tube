/**
 * The song catalog as shipped to browsers (`catalog.json`). Columnar on purpose: parallel arrays of the same length
 * compress far better than one object per song, and artists are stored once and referenced by index.
 * Songs are sorted most popular first, so a prefix of the arrays is always "the popular songs".
 *
 * v2 adds label columns (genre `g`, decade `y`, language `l`, mood/occasion `m`) with their id dictionaries; see
 * taxonomy.ts. v1 files have none of them. Readers must check `v` (`isCatalog`) and treat the labels as optional.
 */
export type CatalogV1 = {
  v: 1;
  /** ISO timestamp of the build. */
  built: string;
  /** Source channel names; `c` indexes into this. */
  channels: string[];
  /** Unique artist (or musical / movie) names; `a` indexes into this. */
  artists: string[];
  songs: {
    /** Clean song title. */
    t: string[];
    /** Artist index into `artists`, or -1 when the title had no artist. */
    a: number[];
    /** YouTube video id of the best version. */
    id: string[];
    /** Duration in seconds of that video. */
    d: number[];
    /** Channel index of that video. */
    c: number[];
    /** Popularity, 0-255 (log scale of combined views). */
    p: number[];
  };
  /** Other versions of a song (other channels, other keys, piano), keyed by song index: [videoId, channel, durationSec, label]. */
  alts: Record<string, Array<[string, number, number, string]>>;
};

export type Catalog = Omit<CatalogV1, "v" | "songs"> & {
  v: 2;
  /** Genre ids; `g` indexes into this. */
  genres: string[];
  /** Mood / occasion / feature tag ids; `m` indexes into this. */
  tags: string[];
  songs: CatalogV1["songs"] & {
    /** Genre indexes into `genres`, most specific first ([] = unlabeled). */
    g: number[][];
    /** Decade start year / 10 (199 = 1990s), 0 = unknown. */
    y: number[];
    /** ISO 639-1 language code, "" = unknown. */
    l: string[];
    /** Tag indexes into `tags`. */
    m: number[][];
  };
};

/** Any catalog file a reader may meet. */
export type AnyCatalog = CatalogV1 | Catalog;

export const isCatalog = (c: { v: unknown }): c is AnyCatalog => c.v === 1 || c.v === 2;
