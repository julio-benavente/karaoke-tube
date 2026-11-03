import type { ClientMessage, ConnectionStatus, ErrorCode, QueueItem, Reaction, RoomState } from "@karaoke-tube/shared";

/** `browser.runtime.connect({ name })` names. */
export const ROOM_PORT = "room";
export const PLAYER_PORT = "player";

// ── room port: extension pages (host app) ⇄ background ──────────────────

export type RoomPortToPage =
  /** Sent on connect and after every change. `memberId` is the host's. */
  | {
      type: "snapshot";
      status: ConnectionStatus;
      state: RoomState | null;
      memberId: string | null;
      closeReason: "kicked" | "ended" | "left" | null;
    }
  | { type: "reaction"; memberId: string; reaction: Reaction }
  | { type: "error"; code: ErrorCode; message: string };

export type RoomPortToBackground = { type: "send"; msg: ClientMessage };

// ── player port: the party's YouTube tab ⇄ background ───────────────────

export type PlayerPortToTab =
  /** This tab isn't the party's YouTube window: stay out of the way. */
  | { type: "not_party" }
  /** This is the party's tab. `state` is null until the room connection is up. */
  | { type: "party"; code: string; state: RoomState | null }
  | { type: "play"; item: QueueItem }
  | { type: "command"; command: "pause" | "resume" | "restart" }
  /** Nothing to play: stop whatever is on screen. */
  | { type: "stop" }
  /** Room state for the TV overlay, after every change. */
  | { type: "state"; state: RoomState }
  | { type: "reaction"; memberId: string; reaction: Reaction }
  /** Host app's "Show on TV": try to make the player fill the screen. */
  | { type: "fullscreen" };

export type PlayerPortToBackground =
  | { type: "ping" }
  | { type: "event"; event: "started" | "progress" | "ended" | "error"; itemId: string; positionSec?: number };
