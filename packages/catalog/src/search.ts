// Searching the catalog in the browser: typo-tolerant, as-you-type, no network once the catalog is loaded.
// `createCatalogSearchApi` wraps the real API: it answers from the catalog and only asks YouTube (through the API)
// when the catalog finds almost nothing, or for a pasted link it doesn't know.

import MiniSearch from "minisearch";
import type { RoomInfoResponse, SearchApi, SearchResponse, Song, VideoResponse } from "@karaoke-tube/shared";
import { isExplicitText } from "./explicit";
import { explicitTest, filterSongs, normalizeName, songMatcher, type SongFilter } from "./filter";
import { isCatalog, type AnyCatalog } from "./types";

/** Messages between the page and the catalog worker. */
export type WorkerRequestBody =
  | { op: "load"; url: string }
  | { op: "search"; q: string; limit: number; offset: number; filter?: SongFilter }
  | { op: "artists"; q: string; limit: number }
  | { op: "browse"; filter: SongFilter; limit: number; offset: number }
  | { op: "video"; videoId: string };
export type WorkerRequest = WorkerRequestBody & { id: number };
export type WorkerReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

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
  /** Best matches for the text; `filter` narrows them by labels/artist. */
  search(query: string, limit?: number, offset?: number, filter?: SongFilter): Song[];
  /** Artists whose name matches what was typed (every word a prefix of a word of the name), best known first. */
  artists(query: string, limit?: number): string[];
  /** A catalog song by YouTube video id (primary or alternate version). */
  byVideoId(videoId: string): Song | null;
  /** Songs with the given labels (genre, decade, language, tags), most popular first. Empty for a catalog without labels. */
  browse(filter: SongFilter, limit?: number, offset?: number): Song[];
  /** True when the catalog carries genre/decade/language/tag labels (v2). */
  hasLabels: boolean;
};

function newMini(catalog: AnyCatalog): MiniSearch<Doc> {
  const { songs } = catalog;
  return new MiniSearch<Doc>({
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
}

function docsOf(catalog: AnyCatalog): Doc[] {
  const { songs, artists } = catalog;
  return songs.t.map((t, i): Doc => ({ id: i, t, a: songs.a[i]! >= 0 ? artists[songs.a[i]!]! : "" }));
}

/** Builds the search index in one go. Quick for tests and scripts; in a browser use `createCatalogIndexAsync`. */
export function createCatalogIndex(catalog: AnyCatalog): CatalogIndex {
  const mini = newMini(catalog);
  mini.addAll(docsOf(catalog));
  return indexOf(catalog, mini);
}

/**
 * Builds the index in small chunks, giving the browser a turn between them, so a phone never freezes while the
 * catalog of tens of thousands of songs is being indexed.
 */
export async function createCatalogIndexAsync(catalog: AnyCatalog, chunkSize = 250): Promise<CatalogIndex> {
  const mini = newMini(catalog);
  await mini.addAllAsync(docsOf(catalog), { chunkSize });
  return indexOf(catalog, mini);
}

type ArtistRow = { name: string; norm: string; tokens: string[]; songs: number };

function buildArtistTable(catalog: AnyCatalog): ArtistRow[] {
  const songs = new Array<number>(catalog.artists.length).fill(0);
  for (const a of catalog.songs.a) if (a >= 0) songs[a]!++;
  return catalog.artists.map((name, i) => ({ name, norm: tokenize(name).join(" "), tokens: tokenize(name), songs: songs[i]! }));
}

function indexOf(catalog: AnyCatalog, mini: MiniSearch<Doc>): CatalogIndex {
  let artistTable: ArtistRow[] | null = null;
  const { songs, artists, channels, alts } = catalog;
  const artistOf = (i: number) => (songs.a[i]! >= 0 ? artists[songs.a[i]!]! : "");

  const isExplicit = explicitTest(catalog);
  const duetTag = catalog.v === 2 ? catalog.tags.indexOf("duet") : -1;
  const isDuet = (i: number) => catalog.v === 2 && duetTag >= 0 && catalog.songs.m[i]!.includes(duetTag);

  const toSong = (i: number, videoId = songs.id[i]!, channel = songs.c[i]!, durationSec = songs.d[i]!): Song => {
    const artist = artistOf(i);
    return {
      ...(isExplicit(i) ? { explicit: true } : {}),
      ...(isDuet(i) ? { duet: true } : {}),
      videoId,
      // "Artist - Title" is what every screen already knows how to split.
      title: artist ? `${artist} - ${songs.t[i]}` : songs.t[i]!,
      channel: channels[channel] ?? "",
      durationSec,
      thumbnailUrl: thumbnail(videoId),
    };
  };

  let byId: Map<string, Song> | null = null;
  return {
    size: songs.t.length,
    hasLabels: catalog.v >= 2,
    browse: (filter, limit = RESULTS, offset = 0) =>
      filterSongs(catalog, filter, offset + limit)
        .slice(offset)
        .map((i) => toSong(i)),
    artists(query, limit = 5) {
      const q = tokenize(query);
      if (!q.length) return [];
      artistTable ??= buildArtistTable(catalog);
      const joined = q.join(" ");
      const hits: Array<{ name: string; rank: number; songs: number }> = [];
      for (const a of artistTable) {
        if (!q.every((w) => a.tokens.some((t) => t.startsWith(w)))) continue;
        hits.push({ name: a.name, rank: a.norm === joined ? 0 : a.norm.startsWith(joined) ? 1 : 2, songs: a.songs });
      }
      return hits
        .sort((x, y) => x.rank - y.rank || y.songs - x.songs)
        .slice(0, limit)
        .map((h) => h.name);
    },
    search(query, limit = RESULTS, offset = 0, filter) {
      const words = tokenize(query).join(" ");
      if (!words) return [];
      const match = filter ? songMatcher(catalog, filter) : null;
      // Re-rank the best 60: a query that IS a song's title ("love story") or an artist's name ("queen") should beat
      // songs that only contain those words.
      return mini
        .search(query)
        .slice(0, match ? 800 : Math.max(60, offset + limit))
        .map((r) => {
          const i = r.id as number;
          const exact = tokenize(songs.t[i]!).join(" ") === words ? 3 : tokenize(artistOf(i)).join(" ") === words ? 2 : 1;
          return { i, score: r.score * exact };
        })
        .filter(({ i }) => !match || match(i))
        .sort((a, b) => b.score - a.score)
        .slice(offset, offset + limit)
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
  /** Run the catalog in a Web Worker (default in browsers). `false` keeps it in the page's thread. */
  useWorker?: boolean;
};

export async function fetchCatalog(url: string): Promise<AnyCatalog> {
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

/** Where the catalog lives and gets searched: a Web Worker in browsers (nothing heavy ever runs on the page), or this thread. */
type Engine = {
  /** Download, parse and index the catalog. Resolves true when it can answer, false when it can't be loaded. */
  load(): Promise<boolean>;
  search(query: string, limit: number, offset: number, filter?: SongFilter): Promise<Song[]>;
  browse(filter: SongFilter, limit: number, offset: number): Promise<Song[]>;
  artists(query: string, limit: number): Promise<string[]>;
  byVideoId(videoId: string): Promise<Song | null>;
};

function inThreadEngine(url: string, load: (url: string) => Promise<AnyCatalog>): Engine {
  let index: CatalogIndex | null = null;
  return {
    load: () =>
      load(url)
        .then((catalog) => createCatalogIndexAsync(catalog))
        .then((built) => ((index = built), true))
        .catch(() => false),
    search: async (q, limit, offset, filter) => index?.search(q, limit, offset, filter) ?? [],
    artists: async (q, limit) => index?.artists(q, limit) ?? [],
    browse: async (filter, limit, offset) => index?.browse(filter, limit, offset) ?? [],
    byVideoId: async (id) => index?.byVideoId(id) ?? null,
  };
}

/** The same engine inside a Web Worker. Returns null where workers don't exist (tests, old browsers). */
function workerEngine(url: string): Engine | null {
  if (typeof Worker === "undefined" || typeof window === "undefined") return null;
  let worker: Worker | null = null;
  let seq = 0;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const fail = (e: Error) => {
    for (const w of waiting.values()) w.reject(e);
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  const start = (): Worker => {
    const w = new Worker(new URL("./catalog.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const pending = waiting.get(e.data.id);
      if (!pending) return;
      waiting.delete(e.data.id);
      if (e.data.ok) pending.resolve(e.data.result);
      else pending.reject(new Error(e.data.error));
    };
    w.onerror = () => fail(new Error("catalog worker failed"));
    return w;
  };
  const call = <T,>(msg: WorkerRequestBody): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      worker ??= start();
      const id = ++seq;
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...msg, id } satisfies WorkerRequest);
    });

  return {
    load: () => call<boolean>({ op: "load", url }).catch(() => false),
    search: (q, limit, offset, filter) => call<Song[]>({ op: "search", q, limit, offset, filter }).catch(() => []),
    artists: (q, limit) => call<string[]>({ op: "artists", q, limit }).catch(() => []),
    browse: (filter, limit, offset) => call<Song[]>({ op: "browse", filter, limit, offset }).catch(() => []),
    byVideoId: (id) => call<Song | null>({ op: "video", videoId: id }).catch(() => null),
  };
}

export function createCatalogSearchApi(remote: SearchApi, options: CatalogSearchOptions = {}): CatalogSearchApi {
  const { url = CATALOG_URL, fetchCatalog: load = fetchCatalog, waitMs = 6000 } = options;
  const autoLoad = options.autoLoad ?? typeof window !== "undefined";
  // A test-supplied loader runs in this thread; otherwise a browser does everything in a worker.
  const engine = (!options.fetchCatalog && options.useWorker !== false ? workerEngine(url) : null) ?? inThreadEngine(url, load);

  let ready = false;
  let loading: Promise<boolean> | null = null;
  let failedAt = 0;

  function ensure(): Promise<boolean> {
    if (ready) return Promise.resolve(true);
    if (loading) return loading;
    if (failedAt && Date.now() - failedAt < 30_000) return Promise.resolve(false);
    loading = engine
      .load()
      .then((ok) => {
        if (ok) ready = true;
        else failedAt = Date.now();
        return ok;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  if (autoLoad) whenIdle(() => void ensure());

  /** True if the catalog is ready, or will be soon enough to be worth waiting for. */
  async function readyOrWait(): Promise<boolean> {
    if (ready) return true;
    const pending = ensure();
    return Promise.race([pending, new Promise<boolean>((r) => setTimeout(() => r(false), waitMs))]);
  }

  return {
    preload: () => ensure(),

    async search(query, opts = {}) {
      const q = query.trim();
      const limit = opts.limit ?? RESULTS;
      const offset = opts.offset ?? 0;
      if (!q) return { query, results: [] };
      const local = (await readyOrWait()) ? await engine.search(q, limit, offset, opts.filter) : [];
      // Later pages are the catalog only; YouTube is the backup for the first page when the catalog has almost nothing.
      // A label filter can't be applied to YouTube's results, so a filtered search stays in the catalog.
      const filtered = !!opts.filter && Object.values(opts.filter).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
      if (offset > 0 || filtered || local.length >= MIN_LOCAL || q.length < 3) return { query, results: local };

      // The catalog has (almost) nothing: ask YouTube, keep what the catalog found first.
      try {
        const live = await remote.search(query);
        const seen = new Set(local.map((s) => s.videoId));
        // YouTube's results carry no labels: guess "explicit" from the title.
        const fresh = live.results.filter((s) => !seen.has(s.videoId)).map((s) => (isExplicitText(s.title) ? { ...s, explicit: true } : s));
        return { query, results: [...local, ...fresh] satisfies Song[] } satisfies SearchResponse;
      } catch (e) {
        if (local.length) return { query, results: local };
        throw e;
      }
    },

    // Suggestions never wait for the catalog: no catalog yet, no suggestions.
    async artists(query, limit = 5) {
      return ready ? engine.artists(query, limit) : [];
    },

    async browse(filter, limit = RESULTS, offset = 0) {
      return (await readyOrWait()) ? engine.browse(filter, limit, offset) : [];
    },

    async video(videoId): Promise<VideoResponse> {
      // A catalog song needs no network (and no YouTube quota).
      const known = ready ? await engine.byVideoId(videoId) : null;
      if (known) return { song: known };
      const { song } = await remote.video(videoId);
      return { song: isExplicitText(song.title) ? { ...song, explicit: true } : song };
    },

    roomInfo: (code): Promise<RoomInfoResponse> => remote.roomInfo(code),
  };
}
