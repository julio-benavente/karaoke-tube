import { Hono } from "hono";
import type { ApiErrorResponse, Recap, RecapResponse } from "@karaoke-tube/shared";

const ID_RE = /^[0-9a-f]{16}$/;

export const recapRoutes = new Hono<{ Bindings: Env }>()
  // GET /api/recaps/:id  The end-of-night recap, saved by the room when the party ends (kept 30 days).
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const recap = ID_RE.test(id) ? await c.env.RECAPS.get<Recap>(`recap:${id}`, "json") : null;
    if (!recap) {
      return c.json({ error: "not_found", message: "This recap is gone (they last 30 days)." } satisfies ApiErrorResponse, 404);
    }
    return c.json({ recap } satisfies RecapResponse);
  });
