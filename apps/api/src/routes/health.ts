import { Hono } from "hono";
import type { HealthResponse } from "@karaoke-tube/shared";

export const healthRoutes = new Hono<{ Bindings: Env }>().get("/", (c) => {
  console.log("[api] GET /api/health");
  const body: HealthResponse = {
    ok: true,
    service: "karaoke-tube-api",
    time: new Date().toISOString(),
  };
  return c.json(body);
});
