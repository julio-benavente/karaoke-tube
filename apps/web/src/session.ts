import { createCatalogSearchApi } from "@karaoke-tube/catalog";
import { createRoomClient, createSearchApi, localStorageCredentials } from "@karaoke-tube/client";
import { normalizeRoomCode, type ErrorCode, type Role, type RoomClient, type SearchApi } from "@karaoke-tube/shared";
import { createMockRoomClient, createMockSearchApi, MOCK_CODES, randomSeed, type MockRoomClient } from "@karaoke-tube/ui";

/**
 * Picks the clients: the real API by default (same origin; Vite proxies /api to `wrangler dev`),
 * or the mock from @karaoke-tube/ui with `VITE_USE_MOCK=1`.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1";

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

const LAST_ROOM_KEY = "kt:last-room";

export function markJoined(code: string, joined: boolean) {
  try {
    if (joined) {
      storage()?.setItem(JOINED_KEY(code), "1");
      storage()?.setItem(LAST_ROOM_KEY, code);
    } else {
      storage()?.removeItem(JOINED_KEY(code));
      if (storage()?.getItem(LAST_ROOM_KEY) === code) storage()?.removeItem(LAST_ROOM_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * True when this browser is already a member of `code` and can rejoin without asking (it joined, and the
 * member key is still saved). Used to send people straight back after they closed the tab.
 */
export function canResume(code: string): boolean {
  if (!code || !hasJoined(code)) return false;
  return USE_MOCK || localStorageCredentials().load(code) !== null;
}

const HOST_ROOM_KEY = "kt:last-host-room";

/** Remembers (or forgets) the party this browser hosts, so the home page can offer the way back after a restart. */
export function markHosting(code: string, hosting: boolean) {
  try {
    if (hosting) storage()?.setItem(HOST_ROOM_KEY, code);
    else if (storage()?.getItem(HOST_ROOM_KEY) === code) storage()?.removeItem(HOST_ROOM_KEY);
  } catch {
    // ignore
  }
}

/** The party this browser last hosted, if its host credentials are still saved. */
export function resumableHostRoom(): string | null {
  try {
    const code = storage()?.getItem(HOST_ROOM_KEY) ?? null;
    return code && localStorageCredentials().load(code) !== null ? code : null;
  } catch {
    return null;
  }
}

/** Puts an account's saved credentials for a party back on this device. Returns where to go. */
export function adoptLiveParty(p: { code: string; role: string; memberId: string; key: string }): string {
  localStorageCredentials().save(p.code, { memberId: p.memberId, key: p.key });
  if (p.role === "host") {
    markHosting(p.code, true);
    return `/host/${p.code}`;
  }
  markJoined(p.code, true);
  return `/r/${p.code}`;
}

/** The party this browser joined last, if it can still rejoin it. */
export function resumableRoom(): string | null {
  try {
    const code = storage()?.getItem(LAST_ROOM_KEY) ?? null;
    return code && canResume(code) ? code : null;
  } catch {
    return null;
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
  // Songs are searched in our own catalog (in the browser); YouTube only backs up what the catalog lacks.
  searchApi ??= USE_MOCK ? createMockSearchApi() : createCatalogSearchApi(createSearchApi());
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
    // Joins with `identity`; without it, rejoins with the member key saved under kt:room:<CODE>.
    client = createRoomClient({ code, identity });
  }
  clients.set(code, client);
  return client;
}

export function dropRoomClient(code: string) {
  const c = clients.get(code);
  c?.close();
  clients.delete(code);
}

/** Canonical code while typing ("Disco Tiger 427" → "disco-tiger-427"). */
export function normalizeCode(raw: string): string {
  return normalizeRoomCode(raw);
}
