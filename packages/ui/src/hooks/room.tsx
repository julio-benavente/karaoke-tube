import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { serverNow } from "@karaoke-tube/shared";
import type {
  BrowseFilter,
  ClientMessage,
  ConnectionStatus,
  ErrorCode,
  Member,
  Playback,
  Reaction,
  RoomClient,
  RoomState,
  SearchApi,
  Song,
} from "@karaoke-tube/shared";

type Ctx = { client: RoomClient; search: SearchApi | null };
const RoomContext = createContext<Ctx | null>(null);

export function RoomProvider(props: { client: RoomClient; search?: SearchApi; children: ReactNode }) {
  const value = useMemo(() => ({ client: props.client, search: props.search ?? null }), [props.client, props.search]);
  return <RoomContext.Provider value={value}>{props.children}</RoomContext.Provider>;
}

export function useRoomClient(): RoomClient {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoomClient must be used inside <RoomProvider>");
  return ctx.client;
}

/** The SearchApi given to RoomProvider. */
export function useSearchApi(): SearchApi {
  const ctx = useContext(RoomContext);
  if (!ctx?.search) throw new Error("useSearchApi needs RoomProvider with `search`");
  return ctx.search;
}

export type UseRoom = {
  state: RoomState | null;
  me: Member | null;
  status: ConnectionStatus;
  closeReason: RoomClient["closeReason"];
  /** True when me is host or co-host. */
  isHost: boolean;
  send: (msg: ClientMessage) => void;
};

export function useRoom(): UseRoom {
  const client = useRoomClient();
  const subscribe = useCallback((l: () => void) => client.subscribe(l), [client]);
  const state = useSyncExternalStore(subscribe, () => client.state);
  const me = useSyncExternalStore(subscribe, () => client.me);
  const status = useSyncExternalStore(subscribe, () => client.status);
  const closeReason = useSyncExternalStore(subscribe, () => client.closeReason);
  const send = useCallback((msg: ClientMessage) => client.send(msg), [client]);
  return { state, me, status, closeReason, isHost: me?.role === "host" || me?.role === "cohost", send };
}

export type FloatingReaction = { id: number; memberId: string; reaction: Reaction; at: number };

/**
 * Recent reactions (for floating emoji) plus a running total. Each one stays in `recent` for `lifetimeMs`.
 */
export function useReactions(lifetimeMs = 3000): { recent: FloatingReaction[]; total: number } {
  const client = useRoomClient();
  const [recent, setRecent] = useState<FloatingReaction[]>([]);
  const [total, setTotal] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const off = client.onReaction((e) => {
      const r: FloatingReaction = { id: seq.current++, ...e, at: Date.now() };
      setRecent((xs) => [...xs.slice(-30), r]);
      setTotal((n) => n + 1);
      const t = setTimeout(() => {
        timers.delete(t);
        setRecent((xs) => xs.filter((x) => x.id !== r.id));
      }, lifetimeMs);
      timers.add(t);
    });
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  }, [client, lifetimeMs]);
  return { recent, total };
}

/** Calls `fn` on every room error. */
export function useRoomErrors(fn: (e: { code: ErrorCode; message: string }) => void) {
  const client = useRoomClient();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => client.onError((e) => ref.current(e)), [client]);
}

export type UseSearch = {
  query: string;
  /** Set the text and search after the debounce. `{ run: false }` only sets the text. */
  setQuery: (q: string, opts?: { run?: boolean }) => void;
  /** Run a query immediately (no debounce). */
  run: (q: string) => void;
  /**
   * Browse the catalog by labels instead of text (most popular first). With `fallbackQuery`, a text search runs when
   * the catalog has nothing (no catalog yet, or demo mode). `shuffle` mixes the order, for "fresh" shelves.
   */
  browse: (filter: BrowseFilter, opts?: { limit?: number; fallbackQuery?: string; shuffle?: boolean; label?: string }) => void;
  /**
   * Narrow every search by labels (genre, decade, language, tags, artist). With no text typed, the filter alone
   * browses the catalog. Pass `undefined` (or an empty filter) to clear it.
   */
  setFilter: (filter: BrowseFilter | undefined) => void;
  /** Text and filter in one go, one search. */
  apply: (q: string, filter: BrowseFilter | undefined) => void;
  results: Song[];
  loading: boolean;
  error: string | null;
  /** The query `results` belong to. */
  resultsFor: string;
  /** More songs can be loaded for these results (the last page came back full). */
  hasMore: boolean;
  loadingMore: boolean;
  /** Loads the next page of the current search or browse and adds it to `results`. */
  loadMore: () => void;
};

/** Results arrive this many at a time. */
export const SEARCH_PAGE = 40;

type Source = { kind: "search"; q: string; filter?: BrowseFilter } | { kind: "browse"; filter: BrowseFilter; label: string };

const hasFilter = (f: BrowseFilter | undefined): f is BrowseFilter => !!f && Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

/** Debounced search. Takes a SearchApi, or uses the one given to RoomProvider. */
export function useSearch(api?: SearchApi, debounceMs = 300): UseSearch {
  const ctx = useContext(RoomContext);
  const searchApi = api ?? ctx?.search;
  if (!searchApi) throw new Error("useSearch needs a SearchApi (argument or RoomProvider `search`)");
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What the current results came from, so "load more" asks for the same thing. */
  const source = useRef<Source | null>(null);
  const count = useRef(0);
  count.current = results.length;
  const filterRef = useRef<BrowseFilter | undefined>(undefined);
  const queryRef = useRef("");
  queryRef.current = query;
  /** Browse with the current filter (no text typed). */
  const browseFilter = useRef<(f: BrowseFilter) => void>(() => {});

  const run = useCallback(
    (q: string) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++reqId.current;
      const trimmed = q.trim();
      setLoadingMore(false);
      if (!trimmed && hasFilter(filterRef.current)) return browseFilter.current(filterRef.current);
      if (!trimmed) {
        source.current = null;
        setResults([]);
        setResultsFor("");
        setHasMore(false);
        setLoading(false);
        setError(null);
        return;
      }
      const filter = hasFilter(filterRef.current) ? filterRef.current : undefined;
      source.current = { kind: "search", q: trimmed, filter };
      setLoading(true);
      setError(null);
      searchApi
        .search(trimmed, { limit: SEARCH_PAGE, filter })
        .then((res) => {
          if (id !== reqId.current) return;
          setResults(res.results);
          setResultsFor(trimmed);
          setHasMore(res.results.length >= SEARCH_PAGE);
        })
        .catch((e: unknown) => {
          if (id !== reqId.current) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    },
    [searchApi],
  );

  const browse = useCallback<UseSearch["browse"]>(
    (filter, opts = {}) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++reqId.current;
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      const limit = opts.limit ?? SEARCH_PAGE;
      source.current = opts.shuffle ? null : { kind: "browse", filter, label: opts.label ?? "" };
      const finish = (songs: Song[], more: boolean) => {
        if (id !== reqId.current) return;
        const out = opts.shuffle ? [...songs].sort(() => Math.random() - 0.5) : songs;
        setResults(out);
        setResultsFor(opts.label ?? "");
        setHasMore(more && !opts.shuffle);
      };
      (searchApi.browse ? searchApi.browse(filter, limit, 0) : Promise.resolve([] as Song[]))
        .then(async (songs) => {
          if (songs.length || !opts.fallbackQuery) return finish(songs, songs.length >= limit);
          finish((await searchApi.search(opts.fallbackQuery)).results, false);
        })
        .catch((e: unknown) => {
          if (id !== reqId.current) return;
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    },
    [searchApi],
  );

  browseFilter.current = (filter) => browse(filter, { limit: SEARCH_PAGE });

  const setFilter = useCallback(
    (f: BrowseFilter | undefined) => {
      filterRef.current = hasFilter(f) ? f : undefined;
      run(queryRef.current); // text + new filter, or the filter alone, or nothing
    },
    [run],
  );

  /** Set the text and the filter together and search once (used when the address changes, e.g. Back). */
  const apply = useCallback(
    (q: string, f: BrowseFilter | undefined) => {
      setQueryState(q);
      queryRef.current = q;
      filterRef.current = hasFilter(f) ? f : undefined;
      run(q);
    },
    [run],
  );

  const loadMore = useCallback(() => {
    const src = source.current;
    if (!src || loadingMore || loading) return;
    const id = reqId.current;
    const offset = count.current;
    setLoadingMore(true);
    const page: Promise<Song[]> =
      src.kind === "search"
        ? searchApi.search(src.q, { offset, limit: SEARCH_PAGE, filter: src.filter }).then((r) => r.results)
        : searchApi.browse
          ? searchApi.browse(src.filter, SEARCH_PAGE, offset)
          : Promise.resolve([]);
    page
      .then((songs) => {
        if (id !== reqId.current) return; // a newer search started meanwhile
        setResults((prev) => {
          const seen = new Set(prev.map((s) => s.videoId));
          return [...prev, ...songs.filter((s) => !seen.has(s.videoId))];
        });
        setHasMore(songs.length >= SEARCH_PAGE);
      })
      .catch(() => id === reqId.current && setHasMore(false))
      .finally(() => id === reqId.current && setLoadingMore(false));
  }, [searchApi, loadingMore, loading]);

  const setQuery = useCallback(
    (q: string, opts?: { run?: boolean }) => {
      setQueryState(q);
      if (timer.current) clearTimeout(timer.current);
      if (opts?.run === false) return;
      timer.current = setTimeout(() => run(q), debounceMs);
    },
    [run, debounceMs],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return { query, setQuery, run, browse, setFilter, apply, results, loading, error, resultsFor, hasMore, loadingMore, loadMore };
}

/** Current playback position in seconds, extrapolated while playing. Re-renders ~4×/s. */
export function usePlaybackPosition(playback: Playback | null | undefined, durationSec = Infinity): number {
  const [, force] = useState(0);
  const playing = playback?.state === "playing";
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [playing]);
  if (!playback) return 0;
  const pos = playing ? playback.positionSec + (serverNow() - playback.updatedAt) / 1000 : playback.positionSec;
  return Math.max(0, Math.min(pos, durationSec));
}

/**
 * The get-ready countdown ran out more than 2 s ago but the TV hasn't started the song (no TV open, or it still needs
 * its Start click). Screens say so instead of sitting on a dead "0". Re-renders come from `useCountdown`'s tick.
 */
export function isWaitingForTv(playback: { state: string; countdownEndsAt: number | null }): boolean {
  return playback.state === "get_ready" && !!playback.countdownEndsAt && serverNow() > playback.countdownEndsAt + 2000;
}

/** Seconds left until `endsAt` (epoch ms), ticking. */
export function useCountdown(endsAt: number | null | undefined): number {
  // The clock is read while rendering (the state only forces a re-render): a stored "now" would be stale on the first
  // render of a new countdown and flash a wrong, bigger number.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
}

/**
 * Songs seen in this room (played, playing and queued), most frequent first.
 * RoomState has no history, so this remembers what the UI has seen during the session.
 */
export function useRoomSongs(state: RoomState | null): Song[] {
  const seen = useRef(new Map<string, { song: Song; n: number; last: number }>());
  const lastNow = useRef<string | null>(null);
  if (state) {
    const t = Date.now();
    const bump = (song: Song, by: number) => {
      const e = seen.current.get(song.videoId);
      if (e) {
        e.n += by;
        e.last = t;
      } else seen.current.set(song.videoId, { song, n: by, last: t });
    };
    if (state.nowPlaying && state.nowPlaying.id !== lastNow.current) {
      lastNow.current = state.nowPlaying.id;
      bump(state.nowPlaying.song, 2);
    }
    for (const q of state.upNext) if (!seen.current.has(q.song.videoId)) bump(q.song, 1);
  }
  return [...seen.current.values()].sort((a, b) => b.n - a.n || b.last - a.last).map((e) => e.song);
}
