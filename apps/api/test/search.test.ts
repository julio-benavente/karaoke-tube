import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normaliseQuery, parseDuration, parseVideoId } from "../src/youtube";
import { BASE } from "./helpers";

const video = (id: string, title: string, duration = "PT3M25S") => ({
  id,
  snippet: { title, channelTitle: "Sing King", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  contentDetails: { duration },
  status: { embeddable: true },
});

let calls: URL[] = [];
let quotaOut = false;

beforeEach(() => {
  calls = [];
  quotaOut = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    if (url.pathname === "/oembed") {
      const id = new URL(url.searchParams.get("url")!).searchParams.get("v");
      if (id !== "ccccccccccc") return new Response("Bad Request", { status: 400 });
      return Response.json({ title: "Linked Song (Karaoke)", author_name: "Some Channel" });
    }
    if (quotaOut) {
      return Response.json({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, { status: 403 });
    }
    if (url.pathname.endsWith("/search")) {
      return Response.json({ items: [{ id: { videoId: "aaaaaaaaaaa" } }, { id: { videoId: "bbbbbbbbbbb" } }] });
    }
    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id")!.split(",");
      const all = { aaaaaaaaaaa: video("aaaaaaaaaaa", "Bohemian Rhapsody (Karaoke)"), bbbbbbbbbbb: video("bbbbbbbbbbb", "Don't Stop Me Now", "PT1H2M3S") };
      return Response.json({ items: ids.flatMap((id) => (id in all ? [all[id as keyof typeof all]] : [])) });
    }
    return new Response("not found", { status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("helpers", () => {
  it("normalises queries", () => {
    expect(normaliseQuery("  Bohemian   RHAPSODY ")).toBe("bohemian rhapsody");
  });
  it("parses durations", () => {
    expect(parseDuration("PT3M25S")).toBe(205);
    expect(parseDuration("PT1H")).toBe(3600);
    expect(parseDuration("P0D")).toBe(0);
  });
  it("parses video ids and links", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoId("hello")).toBeNull();
  });
});

describe("GET /api/search", () => {
  it("searches YouTube with 'karaoke' appended, adds durations, and caches", async () => {
    const res = await SELF.fetch(`${BASE}/api/search?q=${encodeURIComponent("  Queen  Bohemian ")}`);
    expect(res.status).toBe(200);
    const body = await res.json<{ query: string; results: Array<{ videoId: string; durationSec: number; title: string }> }>();
    expect(body.query).toBe("queen bohemian");
    expect(body.results.map((r) => [r.videoId, r.durationSec])).toEqual([
      ["aaaaaaaaaaa", 205],
      ["bbbbbbbbbbb", 3723],
    ]);
    const search = calls.find((u) => u.pathname.endsWith("/search"))!;
    expect(search.searchParams.get("q")).toBe("queen bohemian karaoke");
    expect(search.searchParams.get("type")).toBe("video");
    expect(search.searchParams.has("videoEmbeddable")).toBe(false);
    expect(search.searchParams.get("maxResults")).toBe("15");
    expect(search.searchParams.get("key")).toBe("test-key");

    // Same query, different spacing/case: served from KV.
    calls = [];
    const again = await SELF.fetch(`${BASE}/api/search?q=QUEEN%20bohemian`);
    expect((await again.json<{ results: unknown[] }>()).results.length).toBe(2);
    expect(calls).toEqual([]);
    expect(await env.SEARCH_CACHE.get("search:v1:queen bohemian")).not.toBeNull();
  });

  it("returns 503 search_unavailable when the quota runs out", async () => {
    quotaOut = true;
    const res = await SELF.fetch(`${BASE}/api/search?q=abba`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "search_unavailable", message: "Search is resting, paste a link instead" });
  });

  it("rejects an empty query", async () => {
    const res = await SELF.fetch(`${BASE}/api/search?q=%20`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/videos/:id", () => {
  it("returns details for an id or a full link, cached", async () => {
    const res = await SELF.fetch(`${BASE}/api/videos/${encodeURIComponent("https://youtu.be/aaaaaaaaaaa")}`);
    expect(res.status).toBe(200);
    const { song } = await res.json<{ song: { videoId: string; title: string; channel: string } }>();
    expect(song).toMatchObject({ videoId: "aaaaaaaaaaa", title: "Bohemian Rhapsody (Karaoke)", channel: "Sing King" });

    calls = [];
    await SELF.fetch(`${BASE}/api/videos/aaaaaaaaaaa`);
    expect(calls).toEqual([]);
  });

  it("404s for an unknown video and 400s for a bad link", async () => {
    expect((await SELF.fetch(`${BASE}/api/videos/zzzzzzzzzzz`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/api/videos/nope`)).status).toBe(400);
  });

  it("falls back to oEmbed (no duration) when the quota runs out", async () => {
    quotaOut = true;
    const res = await SELF.fetch(`${BASE}/api/videos/${encodeURIComponent("https://youtu.be/ccccccccccc")}`);
    expect(res.status).toBe(200);
    expect((await res.json<{ song: unknown }>()).song).toEqual({
      videoId: "ccccccccccc",
      title: "Linked Song (Karaoke)",
      channel: "Some Channel",
      durationSec: 0,
      thumbnailUrl: "https://i.ytimg.com/vi/ccccccccccc/mqdefault.jpg",
    });
    expect((await SELF.fetch(`${BASE}/api/videos/ddddddddddd`)).status).toBe(404);
  });
});
