// Cover sources (tooling for scripts/covers.ts). Each adapter builds one search URL per song and turns the JSON answer
// into source-independent candidates. Verified against real responses (Nov 2026):
//   iTunes  results[].artworkUrl100 = https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/ab/cd/ef/<uuid>/<file>.jpg/100x100bb.jpg
//   Deezer  data[].album.cover_xl   = https://cdn-images.dzcdn.net/images/cover/<md5>/1000x1000-000000-80-0-0.jpg
// Both CDNs serve any size by changing the WxH in the URL, so only the unique part is stored per cover.
// Deezer's field search (q=artist:"A" track:"T") returned nothing for any query when tested, so Deezer gets plain "A T".
import type { Candidate, Song } from "./cover-match.ts";

export type SourceKey = "itunes" | "deezer";

export type Adapter = {
  key: SourceKey;
  /** Minimum gap between two requests, ms (the documented limit, with a little margin). */
  intervalMs: number;
  /** Requests in flight at once (they still respect `intervalMs`). */
  concurrency: number;
  url(song: Song): string;
  parse(body: unknown): Candidate[];
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const itunes: Adapter = {
  key: "itunes",
  intervalMs: 3100, // documented ~20 requests/minute per IP; faster gets 429, then 403
  concurrency: 1,
  url: (song) => `https://itunes.apple.com/search?${new URLSearchParams({ term: `${song.head} ${song.query}`, media: "music", entity: "song", limit: "5" })}`,
  parse(body) {
    const results = rec(body).results;
    if (!Array.isArray(results)) return [];
    return results.flatMap((r, pos) => {
      const o = rec(r);
      const image = str(o.artworkUrl100);
      if (o.kind !== "song" || !image) return [];
      return [{ artist: str(o.artistName), title: str(o.trackName), album: str(o.collectionName), albumArtist: str(o.collectionArtistName), date: str(o.releaseDate) || undefined, image, pos }];
    });
  },
};

/** Results asked of Deezer per search. Free to raise (the limit counts requests); tried 10: only +1 match in 300, so 5. */
const DEEZER_LIMIT = 5;

export const deezer: Adapter = {
  key: "deezer",
  intervalMs: 110, // documented 50 requests / 5 s (10/s); 110 ms leaves a little margin
  concurrency: 3,
  url: (song) => `https://api.deezer.com/search?${new URLSearchParams({ q: `${song.head} ${song.query}`, limit: String(DEEZER_LIMIT) })}`,
  parse(body) {
    const data = rec(body).data;
    if (!Array.isArray(data)) return [];
    return data.flatMap((r, pos) => {
      const o = rec(r);
      const album = rec(o.album);
      const image = str(album.cover_xl);
      // Songs without art point at an empty hash ("/images/cover//1000x1000...").
      if (!image || image.includes("/cover//")) return [];
      return [{ artist: str(rec(o.artist).name), title: str(o.title), album: str(album.title), image, pos }];
    });
  },
};

export const ADAPTERS: Record<SourceKey, Adapter> = { itunes, deezer };

// ---------------------------------------------------------------------------------------------------------------------

/** Split an image URL into a template with {p} (the unique part) and {size}, plus the unique part itself. */
export function splitArtwork(url: string): { template: string; p: string } | null {
  const m = /^(https:\/\/[^/]+\/(?:image\/thumb|images\/cover)\/)(.+?)\/(\d+)x\d+([a-z0-9-]*)\.(jpg|jpeg|png|webp)$/i.exec(url);
  if (!m) return null;
  return { template: `${m[1]}{p}/{size}x{size}${m[4]}.${m[5]}`, p: m[2]! };
}
