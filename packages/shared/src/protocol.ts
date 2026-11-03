// The contract between the party engine (API, room, extension playback) and the UI.
// Both specs in docs/specs/ build against this file. Change it only as described in docs/specs/README.md.

// ── Domain ──────────────────────────────────────────────────────────────

export type Role = "host" | "cohost" | "guest";

export type Member = {
  id: string;
  nickname: string;
  /** DiceBear seed. The UI renders the avatar from it. */
  avatarSeed: string;
  role: Role;
  connected: boolean;
  joinedAt: number; // epoch ms
};

export type Song = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  thumbnailUrl: string;
};

export type QueueItemStatus = "waiting" | "playing" | "played" | "skipped";

export type QueueItem = {
  id: string;
  song: Song;
  /** Usually one singer. More than one = duet (v1.1). */
  singerIds: string[];
  addedBy: string;
  status: QueueItemStatus;
  addedAt: number;
};

export type QueueMode = "rotation" | "fifo";

export type RoomSettings = {
  queueMode: QueueMode;
  maxWaitingPerMember: number;
  hostsOnlyAdd: boolean;
  locked: boolean;
  reactions: boolean;
  getReadyCard: boolean;
  countdownSec: number;
};

export const DEFAULT_SETTINGS: RoomSettings = {
  queueMode: "rotation",
  maxWaitingPerMember: 2,
  hostsOnlyAdd: false,
  locked: false,
  reactions: true,
  getReadyCard: true,
  countdownSec: 5,
};

export type PlaybackState = "idle" | "get_ready" | "playing" | "paused";

export type Playback = {
  state: PlaybackState;
  /** Position when `updatedAt` was set. While playing, the UI extrapolates from it. */
  positionSec: number;
  updatedAt: number;
  /** Set while state is "get_ready": when the countdown ends. */
  countdownEndsAt: number | null;
};

export type RoomState = {
  code: string;
  status: "open" | "ended";
  members: Member[];
  nowPlaying: QueueItem | null;
  /** Waiting items only, already in play order (the room applies the queue mode). */
  upNext: QueueItem[];
  playback: Playback;
  settings: RoomSettings;
};

export const REACTIONS = ["clap", "fire", "laugh", "heart", "party"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<Reaction, string> = {
  clap: "👏",
  fire: "🔥",
  laugh: "😂",
  heart: "❤️",
  party: "🎉",
};

// ── WebSocket messages: GET /api/rooms/:code/ws ──────────────────────────

/** Phone / host app → room. Hosts = role host or cohost. */
export type ClientMessage =
  | { type: "join"; nickname: string; avatarSeed: string }
  | { type: "rejoin"; memberId: string; key: string }
  | { type: "add_song"; song: Song; singerIds?: string[] }
  | { type: "remove_song"; itemId: string } // own songs; hosts: any
  | { type: "move_song"; itemId: string; toIndex: number } // hosts
  | { type: "skip" } // hosts
  | { type: "pause" } // hosts
  | { type: "resume" } // hosts
  | { type: "restart" } // hosts
  | { type: "set_role"; memberId: string; role: "cohost" | "guest" } // host only
  | { type: "kick"; memberId: string } // hosts
  | { type: "update_settings"; settings: Partial<RoomSettings> } // hosts
  | { type: "end_party" } // host only
  | { type: "react"; reaction: Reaction }
  /** Sent only by the extension's YouTube player (authenticated as the host). */
  | {
      type: "player_event";
      event: "started" | "progress" | "ended" | "error";
      itemId: string;
      positionSec?: number;
      /** The video's real length, from the player. Fills in `song.durationSec` when it was unknown (0). */
      durationSec?: number;
    };

/** Room → clients. */
export type ServerMessage =
  /** Reply to join/rejoin. Store memberId + key to rejoin after a refresh. */
  | { type: "welcome"; memberId: string; key: string; state: RoomState }
  /** Full state after every change. Simple for the MVP; diffs can come later. */
  | { type: "state"; state: RoomState }
  | { type: "reaction"; memberId: string; reaction: Reaction }
  /** Tells the player to load this video (after the get-ready countdown). */
  | { type: "play"; item: QueueItem }
  | { type: "player_command"; command: "pause" | "resume" | "restart" }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "kicked" }
  | { type: "ended" };

export type ErrorCode =
  | "room_not_found"
  | "room_locked"
  | "room_ended"
  | "bad_key"
  | "not_allowed"
  | "queue_limit"
  | "invalid_message";

// ── HTTP: /api ───────────────────────────────────────────────────────────

/** POST /api/rooms  body: CreateRoomRequest */
export type CreateRoomRequest = { nickname: string; avatarSeed: string };
export type CreateRoomResponse = { code: string; memberId: string; key: string };

/** GET /api/rooms/:code */
export type RoomInfoResponse = { code: string; exists: boolean; locked: boolean; status: "open" | "ended" | null };

/** GET /api/search?q=  (the API adds "karaoke" to the query and caches results) */
export type SearchResponse = { query: string; results: Song[] };

/** GET /api/videos/:videoId  (details for a pasted link; also accepts a full YouTube URL, URL-encoded) */
export type VideoResponse = { song: Song };

/**
 * Body of any non-2xx /api response.
 * `search_unavailable` (503): the YouTube quota ran out or search isn't set up. Show "Search is resting, paste a link instead".
 */
export type ApiErrorCode = "bad_request" | "not_found" | "search_unavailable";
export type ApiErrorResponse = { error: ApiErrorCode; message: string };

// ── Client interface the UI codes against ────────────────────────────────

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

/**
 * Spec B builds a mock of this. Spec A builds the real one (WebSocket for phones,
 * a chrome.runtime port for the extension's host app). Swapping them is the only integration step.
 */
export interface RoomClient {
  readonly status: ConnectionStatus;
  readonly state: RoomState | null;
  readonly me: Member | null;
  /**
   * Why status became "closed": the server sent `kicked` or `ended`, or the UI called `close()` ("left").
   * Null while open. Optional so older clients still compile; the UI treats undefined as unknown.
   */
  readonly closeReason?: "kicked" | "ended" | "left" | null;
  send(msg: ClientMessage): void;
  /** Called on every state or status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  onReaction(listener: (e: { memberId: string; reaction: Reaction }) => void): () => void;
  onError(listener: (e: { code: ErrorCode; message: string }) => void): () => void;
  close(): void;
}

export interface SearchApi {
  search(query: string): Promise<SearchResponse>;
  video(videoId: string): Promise<VideoResponse>;
  roomInfo(code: string): Promise<RoomInfoResponse>;
}
