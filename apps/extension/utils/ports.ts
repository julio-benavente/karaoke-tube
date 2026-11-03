import type { ClientMessage, ConnectionStatus, ErrorCode, QueueItem, Reaction, RoomState } from "@karaoke-tube/shared";

/** `browser.runtime.connect({ name })` names. */
export const ROOM_PORT = "room";
export const PLAYER_PORT = "player";

// ── room port: extension pages (host app) ⇄ background ──────────────────

export type RoomPortToPage =
  /** Sent on connect and after every change. `memberId` is the host's. */
  | { type: "snapshot"; status: ConnectionStatus; state: RoomState | null; memberId: string | null }
  | { type: "reaction"; memberId: string; reaction: Reaction }
  | { type: "error"; code: ErrorCode; message: string };

export type RoomPortToBackground = { type: "send"; msg: ClientMessage };

// ── player port: the party's YouTube tab ⇄ background ───────────────────

/** What the TV overlay shows. */
export type OverlayInfo = {
  code: string;
  /** e.g. "Ana · Bohemian Rhapsody", or null when nothing is on. */
  nowSinging: string | null;
  upNext: string | null;
  getReadyEndsAt: number | null;
};

export type PlayerPortToTab =
  /** This tab isn't the party's YouTube window: stay out of the way. */
  | { type: "not_party" }
  | { type: "party"; overlay: OverlayInfo }
  | { type: "play"; item: QueueItem }
  | { type: "command"; command: "pause" | "resume" | "restart" }
  /** Nothing to play: stop whatever is on screen. */
  | { type: "stop" }
  | { type: "overlay"; overlay: OverlayInfo };

export type PlayerPortToBackground =
  | { type: "ping" }
  | { type: "event"; event: "started" | "progress" | "ended" | "error"; itemId: string; positionSec?: number };
