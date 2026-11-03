import type { RoomClient, SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, type MockRoomClient } from "@karaoke-tube/ui";

/**
 * The host page's clients. Uses the mock until Spec A's `createExtensionRoomClient()` exists in
 * `apps/extension/utils/room-client.ts`. Integration: import it here and return it instead of the mock.
 * `?mock=1` forces the mock; `?sim=1` adds simulated reactions and short songs.
 */
export function createHostClients(): { room: RoomClient; search: SearchApi; isMock: boolean } {
  const params = new URLSearchParams(location.search);
  const mock: MockRoomClient = createMockRoomClient({
    code: params.get("code") ?? "PRTY",
    role: "host",
    identity: { nickname: "Host", avatarSeed: "host-seed" },
    simulate: params.get("sim") === "1",
    empty: params.get("empty") === "1",
  });
  (window as unknown as { kt: MockRoomClient }).kt = mock;
  return { room: mock, search: createMockSearchApi(), isMock: true };
}

/** Where guests open the app. The QR code and invite link point here. */
export const WEB_URL: string = (import.meta.env.WXT_WEB_URL as string | undefined) ?? "http://localhost:5173";
