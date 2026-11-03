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
import type {
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
  results: Song[];
  loading: boolean;
  error: string | null;
  /** The query `results` belong to. */
  resultsFor: string;
};

/** Debounced search. Takes a SearchApi, or uses the one given to RoomProvider. */
export function useSearch(api?: SearchApi, debounceMs = 300): UseSearch {
  const ctx = useContext(RoomContext);
  const searchApi = api ?? ctx?.search;
  if (!searchApi) throw new Error("useSearch needs a SearchApi (argument or RoomProvider `search`)");
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    (q: string) => {
      if (timer.current) clearTimeout(timer.current);
      const id = ++reqId.current;
      const trimmed = q.trim();
      if (!trimmed) {
        setResults([]);
        setResultsFor("");
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      searchApi
        .search(trimmed)
        .then((res) => {
          if (id !== reqId.current) return;
          setResults(res.results);
          setResultsFor(trimmed);
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

  return { query, setQuery, run, results, loading, error, resultsFor };
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
  const pos = playing ? playback.positionSec + (Date.now() - playback.updatedAt) / 1000 : playback.positionSec;
  return Math.max(0, Math.min(pos, durationSec));
}

/** Seconds left until `endsAt` (epoch ms), ticking. */
export function useCountdown(endsAt: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
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
