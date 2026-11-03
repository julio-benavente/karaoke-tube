import { createRoomClient, localStorageCredentials } from "@karaoke-tube/client";
import type { RoomClient, SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, type MockRoomClient } from "@karaoke-tube/ui";
import { getSearchApi } from "../session";

/** Where guests open the app. The QR code and invite link point here. */
export const WEB_URL: string = location.origin;

/**
 * The host app opens `/tv/<CODE>#m=<memberId>&k=<key>` for the TV screen. Save the host's credentials like any
 * member's (localStorage `kt:room:<CODE>`) and wipe the fragment from the address bar.
 */
export function adoptHostLink(code: string) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const memberId = hash.get("m");
  const key = hash.get("k");
  if (memberId && key) localStorageCredentials().save(code, { memberId, key });
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

/** Opens the TV screen (`/tv/<code>`) in its own window, with the host's credentials in the fragment. */
export function openTvScreen(code: string): boolean {
  const creds = localStorageCredentials().load(code);
  if (!creds) return false;
  const url = `/tv/${code}#m=${encodeURIComponent(creds.memberId)}&k=${encodeURIComponent(creds.key)}`;
  return !!window.open(url, "kt-tv");
}

export function hasCredentials(code: string): boolean {
  return localStorageCredentials().load(code) !== null;
}

/**
 * The host app's clients: the real room (rejoining with the host's saved key) and search.
 * `?mock=1` uses the mock instead; `?sim=1` adds simulated reactions and short songs.
 */
export function createHostClients(code: string): { room: RoomClient; search: SearchApi; isMock: boolean } {
  const params = new URLSearchParams(location.search);
  if (params.get("mock") !== "1") {
    return { room: createRoomClient({ code }), search: getSearchApi(), isMock: false };
  }
  const mock: MockRoomClient = createMockRoomClient({
    code,
    role: "host",
    identity: { nickname: "Host", avatarSeed: "host-seed" },
    simulate: params.get("sim") === "1",
    empty: params.get("empty") === "1",
  });
  (window as unknown as { kt: MockRoomClient }).kt = mock;
  return { room: mock, search: createMockSearchApi(), isMock: true };
}
