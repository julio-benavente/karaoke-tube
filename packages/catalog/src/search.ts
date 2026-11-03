// Searching the catalog in the browser: typo-tolerant, as-you-type, no network once the catalog is loaded.
// `createCatalogSearchApi` wraps the real API: it answers from the catalog and only asks YouTube (through the API)
// when the catalog finds almost nothing, or for a pasted link it doesn't know.

import MiniSearch from "minisearch";
import type { RoomInfoResponse, SearchApi, SearchResponse, Song, VideoResponse } from "@karaoke-tube/shared";
import { filterSongs, type SongFilter } from "./filter";
import { isCatalog, type AnyCatalog } from "./types";

export const CATALOG_URL = "/catalog/catalog.json";
export const RESULTS = 15;
/** With fewer local hits than this, the live YouTube search is asked as well. */
const MIN_LOCAL = 3;

const thumbnail = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

/** Lowercase, no accents, apostrophes dropped, split on anything that isn't a letter or digit. */
function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

type Doc = { id: number; t: string; a: string };

export type CatalogIndex = {
  /** Number of songs. */
  size: number;
  search(query: string, limit?: number): Song[];
  /** A catalog song by YouTube video id (primary or alternate version). */
  byVideoId(videoId: string): Song | null;
  /** Songs with the given labels (genre, decade, language, tags), most popular first. Empty for a catalog without labels. */
  browse(filter: SongFilter, limit?: number): Song[];
  /** True when the catalog carries genre/decade/language/tag labels (v2). */
  hasLabels: boolean;
};

export function createCatalogIndex(catalog: AnyCatalog): CatalogIndex {
  const { songs, artists, channels, alts } = catalog;
  const artistOf = (i: number) => (songs.a[i]! >= 0 ? artists[songs.a[i]!]! : "");

  const toSong = (i: number, videoId = songs.id[i]!, channel = songs.c[i]!, durationSec = songs.d[i]!): Song => {
    const artist = artistOf(i);
    return {
      videoId,
      // "Artist - Title" is what every screen already knows how to split.
      title: artist ? `${artist} - ${songs.t[i]}` : songs.t[i]!,
      channel: channels[channel] ?? "",
      durationSec,
      thumbnailUrl: thumbnail(videoId),
    };
  };

  const mini = new MiniSearch<Doc>({
    fields: ["t", "a"],
    idField: "id",
    tokenize,
    searchOptions: {
      combineWith: "AND",
      // As-you-type: the word being typed matches by prefix.
      prefix: (_term, i, terms) => i === terms.length - 1,
      // Typos: none on short words, one edit on 4-5 letters, two on longer.
      fuzzy: (term) => (term.length <= 3 ? false : term.length <= 5 ? 1 : 2),
      boost: { a: 1.3 },
      // Popular songs first among equally good matches.
      boostDocument: (id) => 1 + ((songs.p[id as number] ?? 0) / 255) * 2,
    },
  });
  mini.addAll(songs.t.map((t, i): Doc => ({ id: i, t, a: artistOf(i) })));

  let byId: Map<string, Song> | null = null;
  return {
    size: songs.t.length,
    hasLabels: catalog.v >= 2,
    browse: (filter, limit = RESULTS) => filterSongs(catalog, filter, limit).map((i) => toSong(i)),
    search(query, limit = RESULTS) {
      const words = tokenize(query).join(" ");
      if (!words) return [];
      // Re-rank the best 60: a query that IS a song's title ("love story") or an artist's name ("queen") should beat
      // songs that only contain those words.
      return mini
        .search(query)
        .slice(0, 60)
        .map((r) => {
          const i = r.id as number;
          const exact = tokenize(songs.t[i]!).join(" ") === words ? 3 : tokenize(artistOf(i)).join(" ") === words ? 2 : 1;
          return { i, score: r.score * exact };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ i }) => toSong(i));
    },
    byVideoId(videoId) {
      if (!byId) {
        byId = new Map();
        for (let i = 0; i < songs.id.length; i++) byId.set(songs.id[i]!, toSong(i));
        for (const [i, list] of Object.entries(alts)) {
          for (const [id, channel, durationSec] of list) if (!byId.has(id)) byId.set(id, toSong(Number(i), id, channel, durationSec));
        }
      }
      return byId.get(videoId) ?? null;
    },
  };
}

export type CatalogSearchApi = SearchApi & {
  /** Start loading the catalog now. Resolves true once it can answer searches, false if it can't be loaded. */
  preload(): Promise<boolean>;
};

export type CatalogSearchOptions = {
  url?: string;
  /** Load in the browser's idle time right away (default true in a browser). */
  autoLoad?: boolean;
  /** Test hook: where the catalog comes from. */
  fetchCatalog?: (url: string) => Promise<AnyCatalog>;
  /** How long a search waits for a catalog that is still downloading before using YouTube instead. */
  waitMs?: number;
};

async function fetchCatalog(url: string): Promise<AnyCatalog> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const data = (await res.json()) as AnyCatalog;
  // v1 has no labels, v2 adds them; anything newer might have changed shape, so refuse it.
  if (!isCatalog(data)) throw new Error(`unsupported catalog version ${String((data as { v: unknown }).v)}`);
  return data;
}

function whenIdle(work: () => void) {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(work, { timeout: 4000 });
  else setTimeout(work, 1500);
}

export function createCatalogSearchApi(remote: SearchApi, options: CatalogSearchOptions = {}): CatalogSearchApi {
  const { url = CATALOG_URL, fetchCatalog: load = fetchCatalog, waitMs = 6000 } = options;
  const autoLoad = options.autoLoad ?? typeof window !== "undefined";

  let index: CatalogIndex | null = null;
  let loading: Promise<CatalogIndex | null> | null = null;
  let failedAt = 0;

  function ensure(): Promise<CatalogIndex | null> {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    if (failedAt && Date.now() - failedAt < 30_000) return Promise.resolve(null);
    loading = load(url)
      .then((catalog) => (index = createCatalogIndex(catalog)))
      .catch(() => {
        failedAt = Date.now();
        return null;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  if (autoLoad) whenIdle(() => void ensure());

  /** The index if it's ready, or soon enough to be worth waiting for. */
  async function indexOrWait(): Promise<CatalogIndex | null> {
    if (index) return index;
    const pending = ensure();
    return Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
  }

  return {
    preload: async () => (await ensure()) !== null,

    async search(query) {
      const q = query.trim();
      if (!q) return { query, results: [] };
      const local = (await indexOrWait())?.search(q) ?? [];
      if (local.length >= MIN_LOCAL || q.length < 3) return { query, results: local };

      // The catalog has (almost) nothing: ask YouTube, keep what the catalog found first.
      try {
        const live = await remote.search(query);
        const seen = new Set(local.map((s) => s.videoId));
        return { query, results: [...local, ...live.results.filter((s) => !seen.has(s.videoId))] satisfies Song[] } satisfies SearchResponse;
      } catch (e) {
        if (local.length) return { query, results: local };
        throw e;
      }
    },

    async video(videoId): Promise<VideoResponse> {
      // A catalog song needs no network (and no YouTube quota).
      const known = index?.byVideoId(videoId);
      if (known) return { song: known };
      return remote.video(videoId);
    },

    roomInfo: (code): Promise<RoomInfoResponse> => remote.roomInfo(code),
  };
}
