import type { ErrorCode, Role, RoomClient, SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, MOCK_CODES, randomSeed, type MockRoomClient } from "@karaoke-tube/ui";

/**
 * Picks the clients. `VITE_USE_MOCK=1` uses the mock from @karaoke-tube/ui.
 * Integration step: replace the non-mock branch with `createRoomClient` / `createSearchApi` from @karaoke-tube/client.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1" || !HAS_REAL_CLIENT();

// Until Spec A's @karaoke-tube/client lands, the real branch isn't available.
function HAS_REAL_CLIENT() {
  return false;
}

export type Identity = { nickname: string; avatarSeed: string };

const IDENTITY_KEY = "kt:identity";
const JOINED_KEY = (code: string) => `kt:joined:${code}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadIdentity(): Identity {
  try {
    const raw = storage()?.getItem(IDENTITY_KEY);
    if (raw) return JSON.parse(raw) as Identity;
  } catch {
    // ignore
  }
  return { nickname: "", avatarSeed: randomSeed() };
}

export function saveIdentity(id: Identity) {
  try {
    storage()?.setItem(IDENTITY_KEY, JSON.stringify(id));
  } catch {
    // ignore
  }
}

export function markJoined(code: string, joined: boolean) {
  try {
    if (joined) storage()?.setItem(JOINED_KEY(code), "1");
    else storage()?.removeItem(JOINED_KEY(code));
  } catch {
    // ignore
  }
}

export function hasJoined(code: string): boolean {
  try {
    return storage()?.getItem(JOINED_KEY(code)) === "1";
  } catch {
    return false;
  }
}

let searchApi: SearchApi | null = null;
export function getSearchApi(): SearchApi {
  searchApi ??= createMockSearchApi();
  return searchApi;
}

const clients = new Map<string, RoomClient>();

/** Mock-only test knobs from the URL: ?as=cohost|host, ?sim=1, ?empty=1. Remembered for the session. */
function mockFlags() {
  const params = new URLSearchParams(location.search);
  const get = (k: string) => {
    const v = params.get(k);
    try {
      if (v !== null) sessionStorage.setItem(`kt:mock:${k}`, v);
      return v ?? sessionStorage.getItem(`kt:mock:${k}`);
    } catch {
      return v;
    }
  };
  const as = get("as");
  return {
    role: (as === "host" || as === "cohost" ? as : "guest") as Role,
    simulate: get("sim") === "1",
    empty: get("empty") === "1",
  };
}

/**
 * The room client for `code`, created on first use. With `identity` it joins; without, it rejoins
 * (the real client keeps the member key in localStorage).
 */
export function getRoomClient(code: string, identity?: Identity): RoomClient {
  const existing = clients.get(code);
  if (existing && existing.status !== "closed") return existing;
  let client: RoomClient;
  if (USE_MOCK) {
    const flags = mockFlags();
    const joinError: ErrorCode | undefined =
      code === MOCK_CODES.locked ? "room_locked" : code === MOCK_CODES.ended ? "room_ended" : undefined;
    const mock: MockRoomClient = createMockRoomClient({
      code,
      identity: identity ?? loadIdentity(),
      role: flags.role,
      simulate: flags.simulate,
      empty: flags.empty,
      joinError,
    });
    // Console access for testing: kt.mock.kickMe(), kt.mock.endParty(), kt.mock.dropConnection()…
    (window as unknown as { kt: MockRoomClient }).kt = mock;
    client = mock;
  } else {
    throw new Error("Real room client not wired yet (see Integration in docs/specs/B-app-ui.md)");
  }
  clients.set(code, client);
  return client;
}

export function dropRoomClient(code: string) {
  const c = clients.get(code);
  c?.close();
  clients.delete(code);
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}
