/**
 * The song catalog as shipped to browsers (`catalog.json`). Columnar on purpose: parallel arrays of the same length
 * compress far better than one object per song, and artists are stored once and referenced by index.
 * Songs are sorted most popular first, so a prefix of the arrays is always "the popular songs".
 *
 * Genre / decade / language aren't here yet; when they're added they become more parallel columns (`g`, `y`, `l`)
 * and `v` goes up. Readers must check `v`.
 */
export type Catalog = {
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
