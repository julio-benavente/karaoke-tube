import { Hono } from "hono";
import {
  isRoomCode,
  normalizeRoomCode,
  type ApiErrorResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomLanguage,
  type RoomInfoResponse,
  type RoomSettings,
} from "@karaoke-tube/shared";
import type { Context, Next } from "hono";
import { logEvent } from "../log";
import { userFromRequest } from "./account";
import { ADJECTIVES, NOUNS } from "../words";
import { ADJECTIVES_ES, NOUNS_ES } from "../words-es";

/** Unbiased random integer in [0, n). */
function randomInt(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return buf[0]! % n;
}

/** "<adjective>-<adjective>-<noun>" with two different adjectives, e.g. "fuzzy-golden-panda" (Spanish rooms: "feliz-dorado-panda"). */
export function randomCode(language: RoomLanguage = "en"): string {
  const adjectives: readonly string[] = language === "es" ? ADJECTIVES_ES : ADJECTIVES;
  const nouns: readonly string[] = language === "es" ? NOUNS_ES : NOUNS;
  const first = randomInt(adjectives.length);
  let second = randomInt(adjectives.length - 1);
  if (second >= first) second++;
  return `${adjectives[first]}-${adjectives[second]}-${nouns[randomInt(nouns.length)]}`;
}

/**
 * Per-IP rate limit (Workers rate limiting binding). Generous, because a whole party often shares one Wi-Fi IP;
 * with 6-character codes that still makes guessing a live room take days. Skipped when there's no client IP
 * (local tests); Cloudflare always sets it in production.
 */
const limit = (pick: (env: Env) => RateLimit) => async (c: Context<{ Bindings: Env }>, next: Next) => {
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) {
    const { success } = await pick(c.env).limit({ key: ip });
    if (!success) {
      return c.json({ error: "bad_request", message: "Too many tries, wait a minute and try again" } satisfies ApiErrorResponse, 429);
    }
  }
  await next();
};
const lookupLimit = limit((env) => env.ROOM_LOOKUP_LIMITER);
const createLimit = limit((env) => env.ROOM_CREATE_LIMITER);

const roomStub = (env: Env, code: string) => env.ROOM.get(env.ROOM.idFromName(code));

export const roomRoutes = new Hono<{ Bindings: Env }>()
  // Create a room: pick a free code and set up its Durable Object with the host.
  .post("/", createLimit, async (c) => {
    const body = await c.req.json<Partial<CreateRoomRequest>>().catch(() => null);
    const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
    const avatarSeed = typeof body?.avatarSeed === "string" ? body.avatarSeed : "";
    if (!nickname || nickname.length > 100) return c.json({ error: "nickname is required" }, 400);

    // The session language is chosen here, once: it picks the room code's words and every screen in the room follows it.
    const language: RoomLanguage = body?.language === "es" ? "es" : "en";

    // Signed-in hosts get their saved room settings; guests (no token) get the defaults.
    let settings: Partial<RoomSettings> | undefined;
    if (c.req.header("Authorization")) {
      const user = await userFromRequest(c.env, c.req.raw).catch(() => null);
      if (user?.room_settings) settings = JSON.parse(user.room_settings) as Partial<RoomSettings>;
    }
    settings = { ...settings, language };

    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode(language);
      const created = await roomStub(c.env, code).init(code, nickname, avatarSeed, settings);
      if (created) {
        logEvent("room_created", { lang: language, signedIn: !!c.req.header("Authorization") });
        return c.json(created satisfies CreateRoomResponse, 201);
      }
    }
    return c.json({ error: "Couldn't find a free room code, try again" }, 503);
  })

  .get("/:code", lookupLimit, async (c) => {
    const code = normalizeRoomCode(c.req.param("code") ?? "");
    if (!isRoomCode(code)) {
      return c.json({ code, exists: false, locked: false, status: null } satisfies RoomInfoResponse);
    }
    const info = await roomStub(c.env, code).info();
    return c.json({ ...info, code } satisfies RoomInfoResponse);
  })

  // WebSocket entry point: forwards the upgrade request to the room's Durable Object.
  .get("/:code/ws", lookupLimit, async (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.text("Expected a WebSocket upgrade", 426);
    }
    const code = normalizeRoomCode(c.req.param("code") ?? "");
    if (!isRoomCode(code)) return c.text("Room not found", 404);
    return roomStub(c.env, code).fetch(c.req.raw);
  });
