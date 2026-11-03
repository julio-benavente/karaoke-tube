import type { HealthResponse } from "@karaoke-tube/shared";

export const API_URL: string = import.meta.env.WXT_API_URL ?? "http://localhost:8787";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json();
}

/** The party the background is running, as the popup sees it. */
export type PartyInfo = { code: string; guestCount: number };

// One-off messages to the background service worker (`browser.runtime.sendMessage`).
export type ExtMessage =
  | { type: "PING_API" }
  /** Creates a room, opens the host app and a YouTube window for the TV. */
  | { type: "START_PARTY"; nickname: string; avatarSeed: string }
  | { type: "END_PARTY" }
  | { type: "GET_PARTY" }
  /** Popup's "Open host app": open or focus the host app (on the website). */
  | { type: "OPEN_HOST" }
  /** Host app's "Show on TV" (from the website, via externally_connectable). */
  | { type: "SHOW_ON_TV" };

export type StartPartyResponse = { ok: true; code: string } | { ok: false; error: string };
export type EndPartyResponse = { ok: true } | { ok: false; error: string };
export type GetPartyResponse = { ok: true; party: PartyInfo | null };
export type ShowOnTvResponse = { ok: true } | { ok: false; error: string };

/** Where guests open the app. QR codes and invite links point at `${WEB_URL}/join/<CODE>`. */
export const WEB_URL: string = import.meta.env.WXT_WEB_URL ?? "http://localhost:5173";
