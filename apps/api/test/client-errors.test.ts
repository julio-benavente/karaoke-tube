import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { BASE } from "./helpers";

const post = (body: unknown) =>
  SELF.fetch(`${BASE}/api/client-errors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const events = (spy: MockInstance<typeof console.log>) =>
  spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('{"event":"client_error"')).map((l) => JSON.parse(l) as Record<string, unknown>);

describe("client error reports", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a report as client_error, clipped, and answers 204", async () => {
    const spy = vi.spyOn(console, "log");
    const res = await post({ kind: "unhandledrejection", message: "x".repeat(500), stack: "s".repeat(2000), screen: "host/ABC-123?x=1" /* slashes and query are stripped: a join code must not be logged */, version: "1.2" });
    expect(res.status).toBe(204);
    const [e] = events(spy);
    expect(e).toMatchObject({ event: "client_error", kind: "unhandledrejection", screen: "hostABC-123x1" });
    expect(String(e!.message)).toHaveLength(200);
    expect(String(e!.stack)).toHaveLength(600);
  });

  it("ignores empty or malformed reports without failing", async () => {
    const spy = vi.spyOn(console, "log");
    expect((await post({})).status).toBe(204);
    expect((await post("nonsense")).status).toBe(204);
    expect((await SELF.fetch(`${BASE}/api/client-errors`, { method: "POST", body: "{not json" })).status).toBe(204);
    expect(events(spy)).toHaveLength(0);
  });
});
