import { Hono } from "hono";

export const roomRoutes = new Hono<{ Bindings: Env }>()
  // WebSocket entry point: forwards the upgrade request to the room's Durable Object.
  .get("/:code/ws", async (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.text("Expected a WebSocket upgrade", 426);
    }
    const code = c.req.param("code").toUpperCase();
    console.log(`[api] websocket join for room ${code}`);
    const stub = c.env.ROOM.get(c.env.ROOM.idFromName(code));
    return stub.fetch(c.req.raw);
  });
