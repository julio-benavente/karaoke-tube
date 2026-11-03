import { createRoomClient, localStorageCredentials } from "@karaoke-tube/client";
import type { RoomClient, SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, type MockRoomClient } from "@karaoke-tube/ui";
import { getSearchApi } from "../session";

/** Where guests open the app. The QR code and invite link point here. */
export const WEB_URL: string = location.origin;

const EXT_KEY = "kt:ext";

/**
 * The extension opens `/host/<CODE>#m=<memberId>&k=<key>&x=<extensionId>` when it starts a party.
 * Save the host's credentials like any member's (localStorage `kt:room:<CODE>`), remember the extension id
 * for "Show on TV", and wipe the fragment from the address bar.
 */
export function adoptHostLink(code: string) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const memberId = hash.get("m");
  const key = hash.get("k");
  const ext = hash.get("x");
  if (memberId && key) localStorageCredentials().save(code, { memberId, key });
  if (ext) {
    try {
      localStorage.setItem(EXT_KEY, ext);
    } catch {
      // ignore
    }
  }
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
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

type ChromeRuntime = { sendMessage(extensionId: string, msg: unknown): Promise<unknown> };

/** Ask the Karaoke Tube extension (via externally_connectable) to put the YouTube window on the TV. */
export async function askExtensionShowOnTv(): Promise<boolean> {
  let ext: string | null = null;
  try {
    ext = localStorage.getItem(EXT_KEY);
  } catch {
    // ignore
  }
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  if (!ext || !runtime?.sendMessage) return false;
  try {
    const res = (await runtime.sendMessage(ext, { type: "SHOW_ON_TV" })) as { ok?: boolean } | undefined;
    return !!res?.ok;
  } catch {
    return false;
  }
}
