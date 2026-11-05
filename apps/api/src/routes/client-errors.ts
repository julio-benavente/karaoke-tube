import { Hono } from "hono";
import { logEvent } from "../log";

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * The app reports its own crashes here (phones, TVs, hosts) so they show up in Workers Logs next to the server events,
 * as `client_error`. Only a first path segment is kept ("host", "join", "tv"), never the full URL: join codes live in it.
 * Rate limited per IP; always answers 204 so a failing report can never break the app.
 */
export const clientErrorRoutes = new Hono<{ Bindings: Env }>().post("/", async (c) => {
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) {
    const { success } = await c.env.CLIENT_ERROR_LIMITER.limit({ key: ip });
    if (!success) return c.body(null, 204);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const message = clip(body?.message, 200);
  if (!message) return c.body(null, 204);
  const kind = body?.kind === "unhandledrejection" ? "unhandledrejection" : "error";
  const screen = clip(body?.screen, 20).replace(/[^a-z0-9_-]/gi, "");
  logEvent("client_error", { kind, screen, message, stack: clip(body?.stack, 600), version: clip(body?.version, 40) });
  return c.body(null, 204);
});
