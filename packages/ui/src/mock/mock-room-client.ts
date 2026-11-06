import { detectLang, translate, type Lang } from "../i18n/core";
import { normalizeRoomCode } from "@karaoke-tube/shared";
import {
  DEFAULT_SETTINGS,
  REACTIONS,
  type AwardWindow,
  type ClientMessage,
  type ConnectionStatus,
  type ErrorCode,
  type Member,
  type QueueItem,
  type Reaction,
  type Role,
  type RoomClient,
  type RoomSettings,
  type RoomState,
  type Song,
} from "@karaoke-tube/shared";
import { SAMPLE_SONGS, sampleMembers, sampleRecap } from "./sample-data";

export type MockRoomOptions = {
  /** Room code. Default "groovy-disco-party". */
  code?: string;
  /** Join right after connecting with this nickname/avatar. Without it, the UI sends `join` itself. */
  identity?: { nickname: string; avatarSeed: string };
  /** Role of "me" after joining. Default "guest". */
  role?: Role;
  /** Delay before status becomes "open". Default 400 ms. */
  connectDelayMs?: number;
  /** Make `join` fail with this error (to test the Join screen). */
  joinError?: ErrorCode;
  settings?: Partial<RoomSettings>;
  /** Start with nothing playing and an empty queue. */
  empty?: boolean;
  /** Start the simulation (random reactions, short songs) right away. */
  simulate?: boolean;
};

export type SimulateOptions = {
  /** Mean ms between random reactions. Default 2500. */
  reactionEveryMs?: number;
  /** Finish each song after this many seconds. Default 25. */
  songLengthSec?: number;
};

/** Test controls on top of the RoomClient interface. */
export type MockControls = {
  simulate(options?: SimulateOptions): () => void;
  stopSimulation(): void;
  /** End the current song now, as if the player reported `ended`. */
  finishSong(): void;
  /** A random other member sends a reaction. */
  randomReaction(): void;
  /** Drop the connection for `ms` (status "reconnecting"), then come back. */
  dropConnection(ms?: number): void;
  /** The host removes me. */
  kickMe(): void;
  /** The host ends the party. */
  endParty(): void;
  /** Re-run: room is locked / unlocked from outside. */
  setSettings(settings: Partial<RoomSettings>): void;
  /** Another member (a random connected one by default) adds a song, e.g. to see "Host picks" waiting songs. */
  addSongAs(song?: Song, memberId?: string): void;
};

export type MockRoomClient = RoomClient & { mock: MockControls };

const ME_ID = "m-me";
let itemSeq = 0;
const newItemId = () => `q-${Date.now().toString(36)}-${(itemSeq++).toString(36)}`;
const isHost = (m: Member | undefined | null) => m?.role === "host" || m?.role === "cohost";
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/**
 * A RoomClient that runs the whole room locally. It applies every ClientMessage the way the real room would
 * (permissions, queue limit, rotation order, playback), so the UI behaves for real without the API.
 */
export function createMockRoomClient(options: MockRoomOptions = {}): MockRoomClient {
  const code = normalizeRoomCode(options.code ?? "groovy-disco-party");
  const myRole: Role = options.role ?? "guest";
  const now = Date.now();
  const others = sampleMembers(myRole, now);
  const settings: RoomSettings = { ...DEFAULT_SETTINGS, ...options.settings };

  let status: ConnectionStatus = "connecting";
  let closeReason: "kicked" | "ended" | "left" | "forgotten" | null = null;
  let meId: string | null = null;
  let roomState: RoomState = buildInitialState();
  /** The state the UI sees: null until joined. */
  let visibleState: RoomState | null = null;
  let me: Member | null = null;

  const listeners = new Set<() => void>();
  const reactionListeners = new Set<(e: { memberId: string; reaction: Reaction }) => void>();
  const errorListeners = new Set<(e: { code: ErrorCode; message: string }) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let simTimer: ReturnType<typeof setTimeout> | null = null;
  let simSongLength: number | null = null;
  let countdownTimer: ReturnType<typeof setTimeout> | null = null;
  let awardTimer: ReturnType<typeof setTimeout> | null = null;

  function buildInitialState(): RoomState {
    if (options.empty) {
      return {
        code,
        status: "open",
        members: others,
        nowPlaying: null,
        upNext: [],
        pending: [],
        awardWindow: null,
        playback: { state: "idle", positionSec: 0, updatedAt: now, countdownEndsAt: null },
        settings,
      };
    }
    const [first, ...rest] = shuffle(SAMPLE_SONGS);
    const singers = others.filter((m) => m.connected);
    const nowPlaying: QueueItem = {
      id: newItemId(),
      song: first!,
      singerIds: [singers[1]!.id],
      addedBy: singers[1]!.id,
      status: "playing",
      addedAt: now - 10 * 60_000,
    };
    const upNext: QueueItem[] = rest.slice(0, 5).map((song, i) => {
      const singer = singers[(i + 2) % singers.length]!;
      // A sample duet and a group song, so the queue shows "Ana & Ben" and "Everyone".
      const partner = singers[(i + 3) % singers.length]!;
      const duet = i === 1 && partner.id !== singer.id;
      return {
        id: newItemId(),
        song,
        singerIds: duet ? [singer.id, partner.id] : [singer.id],
        addedBy: singer.id,
        status: "waiting",
        addedAt: now - (8 - i) * 60_000,
        ...(i === 3 ? { everyone: true } : {}),
      };
    });
    return {
      code,
      status: "open",
      members: others,
      nowPlaying,
      upNext,
      pending: [],
      awardWindow: null,
      playback: { state: "playing", positionSec: 42, updatedAt: now, countdownEndsAt: null },
      settings,
    };
  }

  // ── plumbing ──────────────────────────────────────────────────────────

  function later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function notify() {
    for (const l of [...listeners]) l();
  }

  function commit(next: RoomState) {
    roomState = next;
    if (meId) {
      visibleState = next;
      me = next.members.find((m) => m.id === meId) ?? null;
    }
    notify();
  }

  function error(code: ErrorCode, message: string) {
    for (const l of [...errorListeners]) l({ code, message });
  }

  function emitReaction(memberId: string, reaction: Reaction) {
    if (!roomState.settings.reactions) return;
    for (const l of [...reactionListeners]) l({ memberId, reaction });
  }

  function setStatus(next: ConnectionStatus) {
    status = next;
    notify();
  }

  // ── playback ──────────────────────────────────────────────────────────

  function positionNow(st: RoomState) {
    const p = st.playback;
    if (p.state !== "playing") return p.positionSec;
    return p.positionSec + (Date.now() - p.updatedAt) / 1000;
  }

  /** Move to the next song (or idle). `how` marks the finished item. */
  function advance(how: "played" | "skipped") {
    if (countdownTimer) clearTimeout(countdownTimer);
    countdownTimer = null;
    const [next, ...rest] = roomState.upNext;
    const t = Date.now();
    const done = roomState.nowPlaying;
    // A song that really started opens the awards window for 60 s.
    const awardWindow = done && done.status === "playing" ? openAwardWindow({ ...done, status: how }, t) : roomState.awardWindow;
    if (!next) {
      commit({
        ...roomState,
        awardWindow,
        nowPlaying: null,
        upNext: [],
        playback: { state: "idle", positionSec: 0, updatedAt: t, countdownEndsAt: null },
      });
      return;
    }
    if (roomState.settings.getReadyCard) {
      const endsAt = t + roomState.settings.countdownSec * 1000;
      commit({
        ...roomState,
        awardWindow,
        nowPlaying: { ...next, status: "waiting" },
        upNext: rest,
        playback: { state: "get_ready", positionSec: 0, updatedAt: t, countdownEndsAt: endsAt },
      });
      countdownTimer = later(startNowPlaying, endsAt - t + 600); // + time for YouTube to start
    } else {
      commit({ ...roomState, awardWindow, nowPlaying: { ...next, status: "waiting" }, upNext: rest });
      startNowPlaying();
    }
  }

  function openAwardWindow(item: QueueItem, t: number): AwardWindow {
    if (awardTimer) clearTimeout(awardTimer);
    awardTimer = later(() => {
      awardTimer = null;
      commit({ ...roomState, awardWindow: null });
    }, 60_000);
    return { item, closesAt: t + 60_000, counts: {}, givenBy: [] };
  }

  function startNowPlaying() {
    countdownTimer = null;
    if (!roomState.nowPlaying) return;
    commit({
      ...roomState,
      nowPlaying: { ...roomState.nowPlaying, status: "playing" },
      playback: { state: "playing", positionSec: 0, updatedAt: Date.now(), countdownEndsAt: null },
    });
  }

  /** Runs every second: ends songs when they reach their length. */
  const tick = setInterval(() => {
    if (status === "closed") return;
    const np = roomState.nowPlaying;
    if (!np || roomState.playback.state !== "playing") return;
    const length = simSongLength ?? np.song.durationSec;
    if (positionNow(roomState) >= length) advance("played");
  }, 1000);

  // ── queue order ───────────────────────────────────────────────────────

  /** Rotation: insert so that each singer gets one song per round. A duet counts for each singer. */
  function insertFair(upNext: QueueItem[], item: QueueItem): QueueItem[] {
    if (roomState.settings.queueMode === "fifo" || roomState.settings.queueMode === "approval") return [...upNext, item];
    const turns = (it: QueueItem) => it.singerIds;
    const seen = new Map<string, number>();
    if (roomState.nowPlaying) for (const id of turns(roomState.nowPlaying)) seen.set(id, 1);
    const myRound = Math.max(...turns(item).map((id) => upNext.filter((q) => turns(q).includes(id)).length + (seen.get(id) ?? 0)));
    for (let i = 0; i < upNext.length; i++) {
      const ids = turns(upNext[i]!);
      const round = Math.max(...ids.map((id) => seen.get(id) ?? 0));
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      if (round > myRound) return [...upNext.slice(0, i), item, ...upNext.slice(i)];
    }
    return [...upNext, item];
  }

  // ── messages ──────────────────────────────────────────────────────────

  function join(nickname: string, avatarSeed: string) {
    if (options.joinError) return error(options.joinError, errorText(options.joinError));
    if (roomState.status === "ended") return error("room_ended", errorText("room_ended"));
    if (roomState.settings.locked) return error("room_locked", errorText("room_locked"));
    const taken = roomState.members.some((m) => m.nickname.toLowerCase() === nickname.toLowerCase());
    const member: Member = {
      id: ME_ID,
      nickname: taken ? `${nickname} 2` : nickname,
      avatarSeed,
      role: myRole,
      connected: true,
      joinedAt: Date.now(),
    };
    meId = ME_ID;
    const members = myRole === "host" ? [member, ...roomState.members] : [...roomState.members, member];
    commit({ ...roomState, members });
  }

  function handle(msg: ClientMessage, from: string) {
    const sender = roomState.members.find((m) => m.id === from);
    const host = isHost(sender);
    const deny = () => error("not_allowed", errorText("not_allowed"));

    switch (msg.type) {
      case "join":
        return join(msg.nickname, msg.avatarSeed);
      case "rejoin":
        return; // the mock keeps no keys
      case "add_song": {
        if (!sender) return deny();
        const st = roomState.settings;
        if (st.hostsOnlyAdd && !host) return deny();
        const everyone = msg.everyone === true;
        const singerIds = everyone ? [from] : msg.singerIds?.length ? [...new Set(msg.singerIds)] : [from];
        if ((everyone || singerIds.length > 1) && !st.duets) return deny();
        if (!host && !singerIds.includes(from)) return deny();
        const waiting = [...roomState.upNext, ...(roomState.pending ?? [])].filter((q) => q.singerIds.includes(from)).length;
        if (!host && waiting >= st.maxWaitingPerMember) {
          return error("queue_limit", `You can have ${st.maxWaitingPerMember} songs waiting at a time.`);
        }
        const wait = st.queueMode === "approval" && !host;
        const item: QueueItem = {
          id: newItemId(),
          song: msg.song,
          singerIds,
          addedBy: from,
          status: wait ? "pending" : "waiting",
          addedAt: Date.now(),
          ...(everyone ? { everyone: true } : {}),
        };
        if (wait) return commit({ ...roomState, pending: [...(roomState.pending ?? []), item] });
        commit({ ...roomState, upNext: insertFair(roomState.upNext, item) });
        if (!roomState.nowPlaying) advance("played");
        return;
      }
      case "approve_song":
      case "decline_song": {
        if (!host) return deny();
        const item = roomState.pending?.find((q) => q.id === msg.itemId);
        if (!item) return deny();
        const pending = (roomState.pending ?? []).filter((q) => q.id !== msg.itemId);
        if (msg.type === "decline_song") return commit({ ...roomState, pending });
        commit({ ...roomState, pending, upNext: insertFair(roomState.upNext, { ...item, status: "waiting" }) });
        if (!roomState.nowPlaying) advance("played");
        return;
      }
      case "give_award": {
        const win = roomState.awardWindow;
        if (!sender || !roomState.settings.awards || !win || win.item.id !== msg.itemId || win.closesAt < Date.now()) return deny();
        if (win.item.singerIds.includes(from) || win.givenBy.includes(from)) return deny();
        return commit({
          ...roomState,
          awardWindow: {
            ...win,
            counts: { ...win.counts, [msg.award]: (win.counts[msg.award] ?? 0) + 1 },
            givenBy: [...win.givenBy, from],
          },
        });
      }
      case "remove_song": {
        const waitingItem = roomState.pending?.find((q) => q.id === msg.itemId);
        if (waitingItem) {
          if (!host && waitingItem.addedBy !== from) return deny();
          return commit({ ...roomState, pending: (roomState.pending ?? []).filter((q) => q.id !== msg.itemId) });
        }
        const item = roomState.upNext.find((q) => q.id === msg.itemId);
        if (!item) return;
        if (!host && item.addedBy !== from && !item.singerIds.includes(from)) return deny();
        return commit({ ...roomState, upNext: roomState.upNext.filter((q) => q.id !== msg.itemId) });
      }
      case "move_song": {
        if (!host) return deny();
        const from_ = roomState.upNext.findIndex((q) => q.id === msg.itemId);
        if (from_ < 0) return;
        const list = [...roomState.upNext];
        const [it] = list.splice(from_, 1);
        list.splice(Math.max(0, Math.min(msg.toIndex, list.length)), 0, it!);
        return commit({ ...roomState, upNext: list });
      }
      case "skip":
        if (!host) return deny();
        return advance("skipped");
      case "pause":
        if (!host) return deny();
        if (roomState.playback.state !== "playing") return;
        return commit({
          ...roomState,
          playback: { ...roomState.playback, state: "paused", positionSec: positionNow(roomState), updatedAt: Date.now() },
        });
      case "resume":
        if (!host) return deny();
        if (roomState.playback.state !== "paused") return;
        return commit({ ...roomState, playback: { ...roomState.playback, state: "playing", updatedAt: Date.now() } });
      case "restart":
        if (!host) return deny();
        if (!roomState.nowPlaying) return;
        return commit({ ...roomState, playback: { ...roomState.playback, positionSec: 0, updatedAt: Date.now() } });
      case "set_role":
        if (sender?.role !== "host" && !(sender?.role === "cohost" && msg.memberId === sender.id && msg.role === "guest")) return deny();
        return commit({
          ...roomState,
          members: roomState.members.map((m) => (m.id === msg.memberId ? { ...m, role: msg.role } : m)),
        });
      case "kick": {
        if (!host) return deny();
        const target = roomState.members.find((m) => m.id === msg.memberId);
        if (!target || target.role === "host") return deny();
        if (target.id === meId) return kickMe();
        return commit({
          ...roomState,
          members: roomState.members.filter((m) => m.id !== msg.memberId),
          upNext: roomState.upNext.filter((q) => !q.singerIds.includes(msg.memberId)),
          pending: (roomState.pending ?? []).filter((q) => !q.singerIds.includes(msg.memberId)),
        });
      }
      case "update_settings":
        if (!host) return deny();
        return applySettings(msg.settings);
      case "add_guest": {
        if (!host) return deny();
        return commit({
          ...roomState,
          members: [
            ...roomState.members,
            { id: `m${Date.now()}`, nickname: msg.nickname.trim().slice(0, 30) || "Guest", avatarSeed: msg.avatarSeed, role: "guest", connected: true, joinedAt: Date.now(), phoneless: true },
          ],
        });
      }
      case "update_avatar":
        if (!sender) return;
        return commit({ ...roomState, members: roomState.members.map((m) => (m.id === sender.id ? { ...m, avatarSeed: msg.avatarSeed } : m)) });
      case "show_join":
        if (!host) return deny();
        return;
      case "end_party":
        if (sender?.role !== "host") return deny();
        return endParty();
      case "react":
        if (!sender) return;
        return emitReaction(from, msg.reaction);
      case "player_event":
        return;
    }
  }

  /** Switching "Host picks" off lets every pending song in. */
  function applySettings(patch: Partial<RoomSettings>) {
    const settings = { ...roomState.settings, ...patch };
    const leaving = roomState.settings.queueMode === "approval" && settings.queueMode !== "approval";
    let upNext = roomState.upNext;
    if (leaving) for (const q of roomState.pending ?? []) upNext = insertFair(upNext, { ...q, status: "waiting" });
    commit({ ...roomState, settings, upNext, pending: leaving ? [] : roomState.pending });
    if (leaving && !roomState.nowPlaying) advance("played");
  }

  function kickMe() {
    closeReason = "kicked";
    commit({ ...roomState, members: roomState.members.filter((m) => m.id !== meId) });
    stopSimulation();
    setStatus("closed");
  }

  function endParty() {
    stopSimulation();
    closeReason = "ended";
    commit({
      ...roomState,
      status: "ended",
      playback: { state: "idle", positionSec: 0, updatedAt: Date.now(), countdownEndsAt: null },
      recap: sampleRecap(roomState.members),
    });
    setStatus("closed");
  }

  // ── simulation ────────────────────────────────────────────────────────

  function randomReaction() {
    const m = pick(roomState.members.filter((x) => x.id !== meId && x.connected));
    emitReaction(m.id, pick(REACTIONS));
  }

  function stopSimulation() {
    if (simTimer) clearTimeout(simTimer);
    simTimer = null;
    simSongLength = null;
  }

  function simulate(opts: SimulateOptions = {}) {
    stopSimulation();
    const every = opts.reactionEveryMs ?? 2500;
    simSongLength = opts.songLengthSec ?? 25;
    const loop = () => {
      // Bursts feel more like a real room.
      const burst = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 4) : 1;
      for (let i = 0; i < burst; i++) later(randomReaction, i * 120);
      // Keep the queue alive: other members add songs when it runs low.
      if (roomState.upNext.length < 3 && Math.random() < 0.5) {
        const m = pick(roomState.members.filter((x) => x.id !== meId && x.connected));
        handle({ type: "add_song", song: pick(SAMPLE_SONGS) }, m.id);
      }
      simTimer = setTimeout(loop, every * (0.5 + Math.random()));
    };
    simTimer = setTimeout(loop, 600);
    return stopSimulation;
  }

  // ── connect ───────────────────────────────────────────────────────────

  later(() => {
    setStatus("open");
    if (options.identity) join(options.identity.nickname, options.identity.avatarSeed);
    if (options.simulate) simulate();
  }, options.connectDelayMs ?? 400);

  const client: MockRoomClient = {
    get status() {
      return status;
    },
    get state() {
      return visibleState;
    },
    get me() {
      return me;
    },
    get closeReason() {
      return closeReason;
    },
    send(msg) {
      if (status !== "open") return;
      // Small delay, like a round trip.
      later(() => handle(msg, msg.type === "join" ? ME_ID : (meId ?? "")), 60);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onReaction(listener) {
      reactionListeners.add(listener);
      return () => reactionListeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    close() {
      stopSimulation();
      clearInterval(tick);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (closeReason === null) closeReason = "left";
      if (status !== "closed") setStatus("closed");
    },
    mock: {
      simulate,
      stopSimulation,
      finishSong: () => advance("played"),
      randomReaction,
      dropConnection(ms = 3000) {
        setStatus("reconnecting");
        later(() => setStatus("open"), ms);
      },
      kickMe,
      endParty,
      setSettings: (s) => applySettings(s),
      addSongAs(song = pick(SAMPLE_SONGS), memberId) {
        const m = memberId ?? pick(roomState.members.filter((x) => x.id !== meId && x.connected && x.role === "guest")).id;
        handle({ type: "add_song", song }, m);
      },
    },
  };
  return client;
}

/** The text for an error code, in the session's language when you know it (else the device's). */
export function errorText(code: ErrorCode, lang: Lang = detectLang()): string {
  return translate(lang, `error.${code}`);
}

function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type { Song };
