import { Hono } from "hono";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ApiErrorResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomInfoResponse,
} from "@karaoke-tube/shared";
import type { Context, Next } from "hono";

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** 256 is a multiple of 32, so `b % 32` is unbiased. */
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
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

    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode();
      const created = await roomStub(c.env, code).init(code, nickname, avatarSeed);
      if (created) return c.json(created satisfies CreateRoomResponse, 201);
    }
    return c.json({ error: "Couldn't find a free room code, try again" }, 503);
  })

  .get("/:code", lookupLimit, async (c) => {
    const code = (c.req.param("code") ?? "").toUpperCase();
    if (!CODE_RE.test(code)) {
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
    const code = (c.req.param("code") ?? "").toUpperCase();
    if (!CODE_RE.test(code)) return c.text("Room not found", 404);
    return roomStub(c.env, code).fetch(c.req.raw);
  });
