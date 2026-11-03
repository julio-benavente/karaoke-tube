import { Hono } from "hono";
import type { CreateRoomRequest, CreateRoomResponse, RoomInfoResponse } from "@karaoke-tube/shared";

/** No 0/O, 1/I: easy to read off a TV and type on a phone. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const roomStub = (env: Env, code: string) => env.ROOM.get(env.ROOM.idFromName(code));

export const roomRoutes = new Hono<{ Bindings: Env }>()
  // Create a room: pick a free code and set up its Durable Object with the host.
  .post("/", async (c) => {
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

  .get("/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!CODE_RE.test(code)) {
      return c.json({ code, exists: false, locked: false, status: null } satisfies RoomInfoResponse);
    }
    const info = await roomStub(c.env, code).info();
    return c.json({ ...info, code } satisfies RoomInfoResponse);
  })

  // WebSocket entry point: forwards the upgrade request to the room's Durable Object.
  .get("/:code/ws", async (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.text("Expected a WebSocket upgrade", 426);
    }
    const code = c.req.param("code").toUpperCase();
    if (!CODE_RE.test(code)) return c.text("Room not found", 404);
    return roomStub(c.env, code).fetch(c.req.raw);
  });
