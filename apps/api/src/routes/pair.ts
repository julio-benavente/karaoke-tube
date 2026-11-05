import { Hono } from "hono";
import type { Context, Next } from "hono";
import { isRoomCode, normalizeRoomCode, type ApiErrorResponse, type PairClaimRequest } from "@karaoke-tube/shared";

const stub = (env: Env) => env.PAIRING.get(env.PAIRING.idFromName("pairing"));

/** Per-IP limit, like the room lookups: pairing codes are short, so guessing has to stay slow. */
const limit = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) {
    const { success } = await c.env.ROOM_LOOKUP_LIMITER.limit({ key: `pair:${ip}` });
    if (!success) return c.json({ error: "bad_request", message: "Too many tries, wait a minute and try again" } satisfies ApiErrorResponse, 429);
  }
  await next();
};

const fail = (c: Context, status: 400 | 403 | 404, message: string) =>
  c.json({ error: status === 404 ? "not_found" : "bad_request", message } satisfies ApiErrorResponse, status);

export const pairRoutes = new Hono<{ Bindings: Env }>()
  // A TV asks for a code to show on its screen.
  .post("/start", limit, async (c) => {
    const body = await c.req.json<{ previous?: unknown }>().catch(() => null);
    return c.json(await stub(c.env).start(typeof body?.previous === "string" ? body.previous.slice(0, 64) : undefined));
  })

  // The TV polls until the host has entered the code.
  .get("/:id", limit, async (c) => c.json(await stub(c.env).status(c.req.param("id") ?? "")))

  // The host app pairs the TV that shows `code` with its party. Only a host (or temporary host) can.
  .post("/claim", limit, async (c) => {
    const body = await c.req.json<Partial<PairClaimRequest>>().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().replace(/[\s-]/g, "") : "";
    const roomCode = normalizeRoomCode(typeof body?.roomCode === "string" ? body.roomCode : "");
    if (!/^[0-9]{5}$/.test(code) || !isRoomCode(roomCode) || typeof body?.memberId !== "string" || typeof body.key !== "string") {
      return fail(c, 400, "That code doesn't look right.");
    }
    const pairing = stub(c.env);
    if (!(await pairing.isWaiting(code))) return fail(c, 404, "No TV is showing that code. Check it, or open the TV page again for a new one.");
    const room = c.env.ROOM.get(c.env.ROOM.idFromName(roomCode));
    const screenKey = await room.pairScreen(body.memberId, body.key);
    if (!screenKey) return fail(c, 403, "Only the host can pair a TV.");
    if (!(await pairing.complete(code, roomCode, screenKey))) return fail(c, 404, "That code was just used or has expired.");
    return c.json({ ok: true });
  });
