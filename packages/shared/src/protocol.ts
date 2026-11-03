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
  /**
   * A guest a host added by hand because they have no phone ("add_guest"). Always `connected`, can't react, give
   * awards or become co-host; a host adds songs for them ("Sing as…"). Undefined/false for everyone else.
   */
  phoneless?: boolean;
};

export type Song = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  thumbnailUrl: string;
};

/** "pending": waiting for a host's OK in the "approval" queue mode (v1.1). */
export type QueueItemStatus = "waiting" | "playing" | "played" | "skipped" | "pending";

export type QueueItem = {
  id: string;
  song: Song;
  /** Usually one singer. More than one = duet (v1.1). */
  singerIds: string[];
  addedBy: string;
  status: QueueItemStatus;
  addedAt: number;
  /** "Everyone sings" group song (v1.1). `singerIds` then holds just the person who added it. */
  everyone?: boolean;
};

/** "approval" = "Host picks": guests' songs wait in `RoomState.pending` until a host approves them (v1.1). */
export type QueueMode = "rotation" | "fifo" | "approval";

export type RoomSettings = {
  queueMode: QueueMode;
  maxWaitingPerMember: number;
  hostsOnlyAdd: boolean;
  locked: boolean;
  reactions: boolean;
  getReadyCard: boolean;
  countdownSec: number;
  /** v1.1 host toggles: duets & group songs, turn alerts on phones, awards after songs, end-of-night titles. */
  duets: boolean;
  turnAlerts: boolean;
  awards: boolean;
  titles: boolean;
  /** When the TV shows the join QR + code: "between" = lobby/idle + get-ready card, "always" = also during songs, "start" = lobby/idle only. */
  joinInfo: JoinInfoMode;
};

export type JoinInfoMode = "between" | "always" | "start";

export const DEFAULT_SETTINGS: RoomSettings = {
  queueMode: "rotation",
  maxWaitingPerMember: 2,
  hostsOnlyAdd: false,
  locked: false,
  reactions: true,
  getReadyCard: true,
  countdownSec: 5,
  duets: true,
  turnAlerts: true,
  awards: true,
  titles: true,
  joinInfo: "between",
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
  /**
   * Whether the TV can play: the extension's player is connected AND its YouTube window is open.
   * False when the host closed the TV window (offer "Reopen TV window"). Undefined from older rooms.
   */
  playerConnected?: boolean;
  /**
   * Set while the real host is away: the member who is standing in as host (their role is "host" meanwhile).
   * The real host gets the role back when they return and this member goes back to what they were.
   */
  tempHostId?: string | null;
  /** A TV screen is paired with this party (it may be offline: see `playerConnected`). */
  screenPaired?: boolean;
  /** Songs waiting for a host's OK ("approval" mode), oldest first. v1.1. */
  pending?: QueueItem[];
  /** The performance members can give awards to right now, if any. v1.1. */
  awardWindow?: AwardWindow | null;
  /** End-of-night recap with everyone's titles, once the party has ended. v1.1. */
  recap?: Recap | null;
};

// ── v1.1: awards, titles, recap ──────────────────────────────────────────

/** Positive-only awards members give a performance (no scores). */
export const AWARDS = ["nailed_it", "great_vibes", "crowd_pleaser", "brave_pick"] as const;
export type Award = (typeof AWARDS)[number];
export const AWARD_INFO: Record<Award, { emoji: string; label: string }> = {
  nailed_it: { emoji: "🎯", label: "Nailed it" },
  great_vibes: { emoji: "✨", label: "Great vibes" },
  crowd_pleaser: { emoji: "🙌", label: "Crowd pleaser" },
  brave_pick: { emoji: "💪", label: "Brave pick" },
};

export type AwardWindow = {
  /** The performance that just finished. */
  item: QueueItem;
  /** Awards close at this time (epoch ms). */
  closesAt: number;
  counts: Partial<Record<Award, number>>;
  /** Members who already gave this performance an award. */
  givenBy: string[];
};

export const TITLES = [
  "opening_act",
  "grand_finale",
  "encore",
  "showstopper",
  "crowd_favorite",
  "power_ballad",
  "quick_hit",
  "repeat_performer",
  "duet_partner",
  "dynamic_duo",
  "choir_leader",
  "biggest_fan",
  "standing_ovation",
  "award_giver",
  "fashionably_late",
  "rising_star",
  "brave_soul",
  "great_audience",
  "party_spirit",
] as const;
export type TitleId = (typeof TITLES)[number];
export const TITLE_INFO: Record<TitleId, { emoji: string; name: string; description: string }> = {
  opening_act: { emoji: "🌅", name: "Opening Act", description: "Sang the first song of the night" },
  grand_finale: { emoji: "🌙", name: "Grand Finale", description: "Sang the last song" },
  encore: { emoji: "🎤", name: "Encore!", description: "Sang two songs back to back" },
  showstopper: { emoji: "🌟", name: "Showstopper", description: "The single song with the most cheers" },
  crowd_favorite: { emoji: "👑", name: "Crowd Favorite", description: "Most cheers over the whole night" },
  power_ballad: { emoji: "🎶", name: "Power Ballad", description: "Sang the longest song" },
  quick_hit: { emoji: "⚡", name: "Quick Hit", description: "Sang the shortest song" },
  repeat_performer: { emoji: "🔁", name: "Repeat Performer", description: "Sang the most songs" },
  duet_partner: { emoji: "🤝", name: "Duet Partner", description: "Joined the most duets" },
  dynamic_duo: { emoji: "💞", name: "Dynamic Duo", description: "The duet pair with the most cheers" },
  choir_leader: { emoji: "🎉", name: "Choir Leader", description: "Started a song for everyone" },
  biggest_fan: { emoji: "📣", name: "Biggest Fan", description: "Sent the most reactions" },
  standing_ovation: { emoji: "👏", name: "Standing Ovation", description: "Cheered every performance" },
  award_giver: { emoji: "🏅", name: "Award Giver", description: "Gave the most awards" },
  fashionably_late: { emoji: "🚪", name: "Fashionably Late", description: "Joined after the start and still sang" },
  rising_star: { emoji: "✨", name: "Rising Star", description: "Took the mic for one big moment" },
  brave_soul: { emoji: "💪", name: "Brave Soul", description: "Sang at least one song" },
  great_audience: { emoji: "🎧", name: "Great Audience", description: "Cheered everyone on" },
  party_spirit: { emoji: "🎈", name: "Party Spirit", description: "Made the night better by being there" },
};

/** A song that was performed, with its cheers (reactions + awards). */
export type RecapPerformance = { item: QueueItem; cheers: number; awards: Partial<Record<Award, number>> };

export type Recap = {
  /** Public id: `GET /api/recaps/:id` and the web page `/recap/:id` (kept 30 days). */
  id: string;
  code: string;
  endedAt: number;
  members: Array<Pick<Member, "id" | "nickname" | "avatarSeed">>;
  /** In the order they were sung. */
  performances: RecapPerformance[];
  /** memberId → 2–3 titles (empty when the host turned titles off). */
  titles: Record<string, TitleId[]>;
  /** The most-cheered performance. */
  topMoment: RecapPerformance | null;
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
  /** `singerIds` with partners = duet (when `settings.duets`); `everyone` = group song. v1.1. */
  | { type: "add_song"; song: Song; singerIds?: string[]; everyone?: boolean }
  /** "approval" mode, hosts: let a pending song into the queue, or turn it down. v1.1. */
  | { type: "approve_song"; itemId: string }
  | { type: "decline_song"; itemId: string }
  /** Any member who didn't sing it, once per performance, while `awardWindow` is open. v1.1. */
  | { type: "give_award"; itemId: string; award: Award }
  | { type: "remove_song"; itemId: string } // own songs; hosts: any
  | { type: "move_song"; itemId: string; toIndex: number } // hosts
  | { type: "skip" } // hosts
  | { type: "pause" } // hosts
  | { type: "resume" } // hosts
  | { type: "restart" } // hosts
  | { type: "set_role"; memberId: string; role: "cohost" | "guest" } // host only
  | { type: "kick"; memberId: string } // hosts
  /** Hosts: unpair the TV screen (it goes back to showing a pairing code). */
  | { type: "remove_screen" }
  /** Leave the party for good: your waiting songs go with you. The host leaving ends the party. */
  | { type: "leave" }
  /** Hosts: take everything a member still has waiting out of the queue (e.g. they went offline). */
  | { type: "remove_member_songs"; memberId: string }
  | { type: "update_settings"; settings: Partial<RoomSettings> } // hosts
  | { type: "end_party" } // host only
  /** Hosts: flash the join QR + code on the TV for a few seconds (the room replies to everyone with `join_flash`). */
  | { type: "show_join" }
  /** Hosts: add a guest who has no phone, so they get turns in the rotation. Hosts then add songs for them with `add_song` + `singerIds`. */
  | { type: "add_guest"; nickname: string; avatarSeed: string }
  | { type: "react"; reaction: Reaction }
  /** Sent only by the extension's player: whether its YouTube window (the TV) is open. */
  | { type: "player_status"; tabOpen: boolean }
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
  /** To a paired TV screen: it was removed (or replaced by another one) and must stop. */
  | { type: "screen_removed" }
  | { type: "ended" }
  /** A host asked the TV to show the join QR + code for a few seconds. */
  | { type: "join_flash" };

export type ErrorCode =
  | "room_not_found"
  | "room_locked"
  | "room_ended"
  | "bad_key"
  | "not_allowed"
  | "queue_limit"
  | "invalid_message";

// ── Room codes ───────────────────────────────────────────────────────────

/**
 * Room codes are three words, e.g. "fuzzy-golden-panda": easy to say across a room, ~57 million combinations
 * (the API also rate-limits lookups per IP). Always lowercase with dashes in URLs and storage.
 */
export const ROOM_CODE_EXAMPLE = "fuzzy-golden-panda";
export const ROOM_CODE_RE = /^[a-z]+-[a-z]+-[a-z]+$/;

/**
 * The canonical form of a typed code: lowercase, any run of spaces/dashes/punctuation becomes one dash
 * ("Fuzzy Golden  Panda" → "fuzzy-golden-panda"). Leaves a trailing dash while typing; check the result
 * with `isRoomCode`.
 */
export function normalizeRoomCode(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}

/** For showing a code to people: words with spaces, "fuzzy golden panda". */
export function formatRoomCode(code: string): string {
  return code.replace(/-/g, " ");
}

export function isRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

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

/** GET /api/recaps/:id  (v1.1) */
export type RecapResponse = { recap: Recap };

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
   * Why status became "closed": the server sent `kicked` or `ended`, the UI called `close()` ("left"), or the saved
   * membership is no longer valid ("forgotten": wrong or expired key, e.g. an old rejoin link).
   * Null while open. Optional so older clients still compile; the UI treats undefined as unknown.
   */
  readonly closeReason?: "kicked" | "ended" | "left" | "forgotten" | null;
  send(msg: ClientMessage): void;
  /** Called on every state or status change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  onReaction(listener: (e: { memberId: string; reaction: Reaction }) => void): () => void;
  onError(listener: (e: { code: ErrorCode; message: string }) => void): () => void;
  close(): void;
}

/** Labels to browse the song catalog by. Several values of one kind mean "any"; tags mean "all". */
export type BrowseFilter = {
  genre?: string | string[];
  /** "80s", "90s"… */
  decade?: string | string[];
  /** ISO 639-1, "es". */
  language?: string | string[];
  tag?: string | string[];
};

export interface SearchApi {
  search(query: string): Promise<SearchResponse>;
  /** Songs from our own catalog with these labels, most popular first. Not every implementation has a catalog. */
  browse?(filter: BrowseFilter, limit?: number): Promise<Song[]>;
  video(videoId: string): Promise<VideoResponse>;
  roomInfo(code: string): Promise<RoomInfoResponse>;
}

// ── TV pairing ───────────────────────────────────────────────────────────
// A TV shows a short code; the host types it into the host app; the room then trusts that TV's screen key.
// The TV connects to the room as this reserved member id with its screen key (the `rejoin` message).

/** Reserved member id a paired TV screen connects with. Never a real member. */
export const SCREEN_MEMBER_ID = "screen";

/** POST /api/pair/start: the TV asks for a code to show. */
export type PairStartResponse = { id: string; code: string; expiresInSec: number };
/** GET /api/pair/:id: the TV polls until the host has entered the code. */
export type PairStatusResponse = { state: "waiting" } | { state: "expired" } | { state: "paired"; roomCode: string; screenKey: string };
/** POST /api/pair/claim: the host app, with its room credentials, pairs the TV that shows `code`. */
export type PairClaimRequest = { code: string; roomCode: string; memberId: string; key: string };
