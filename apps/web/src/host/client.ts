import { createSearchApi } from "@karaoke-tube/client";
import type { RoomClient, SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, type MockRoomClient } from "@karaoke-tube/ui";
import { API_URL } from "@/utils/api";
import { createExtensionRoomClient } from "@/utils/room-client";

/**
 * The host page's clients: the party the background runs (over the `room` port) and the real search API.
 * `?mock=1` uses the mock instead; `?sim=1` adds simulated reactions and short songs.
 */
export function createHostClients(): { room: RoomClient; search: SearchApi; isMock: boolean } {
  const params = new URLSearchParams(location.search);
  if (params.get("mock") !== "1") {
    return { room: createExtensionRoomClient(), search: createSearchApi(API_URL), isMock: false };
  }
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

export { WEB_URL } from "@/utils/api";
