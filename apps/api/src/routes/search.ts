import { Hono, type Context } from "hono";
import type { ApiErrorCode, ApiErrorResponse, SearchResponse, Song, VideoResponse } from "@karaoke-tube/shared";
import { logEvent } from "../log";
import {
  SEARCH_TTL_SEC,
  SearchUnavailableError,
  VIDEO_TTL_SEC,
  normaliseQuery,
  oembedLookup,
  parseVideoId,
  searchYouTube,
  videoLookup,
} from "../youtube";

type Ctx = Context<{ Bindings: Env }>;

const RESTING = "Search is resting, paste a link instead";

function apiError(c: Ctx, status: 400 | 404 | 503, error: ApiErrorCode, message: string) {
  return c.json({ error, message } satisfies ApiErrorResponse, status);
}

async function withYouTube<T>(c: Ctx, work: () => Promise<T>): Promise<T | Response> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof SearchUnavailableError) {
      console.warn(`[search] unavailable: ${e.message}`);
      return apiError(c, 503, "search_unavailable", RESTING);
    }
    throw e;
  }
}

export const searchRoutes = new Hono<{ Bindings: Env }>()
  // GET /api/search?q=  YouTube search for "<q> karaoke", cached 7 days per normalised query.
  .get("/search", async (c) => {
    const query = normaliseQuery(c.req.query("q") ?? "");
    if (!query) return apiError(c, 400, "bad_request", "Type something to search for");
    if (query.length > 200) return apiError(c, 400, "bad_request", "That search is too long");

    const cacheKey = `search:v1:${query}`;
    const cached = await c.env.SEARCH_CACHE.get<Song[]>(cacheKey, "json");
    if (cached) {
      // The app only asks the server when its own catalog came up short: these are the songs people look for and we lack.
      logEvent(c.env, "search_fallback", { query: query.slice(0, 80), cached: true, results: cached.length });
      return c.json({ query, results: cached } satisfies SearchResponse);
    }

    const results = await withYouTube(c, () => searchYouTube(c.env.YOUTUBE_API_KEY, query));
    if (results instanceof Response) return results;
    await c.env.SEARCH_CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: SEARCH_TTL_SEC });
    logEvent(c.env, "search_fallback", { query: query.slice(0, 80), cached: false, results: results.length });
    return c.json({ query, results } satisfies SearchResponse);
  })

  // GET /api/videos/:id  Details for a video id or a (URL-encoded) YouTube link, cached 30 days.
  .get("/videos/:id", async (c) => {
    const videoId = parseVideoId(c.req.param("id"));
    if (!videoId) return apiError(c, 400, "bad_request", "That doesn't look like a YouTube link");

    const cacheKey = `video:v1:${videoId}`;
    const cached = await c.env.SEARCH_CACHE.get<Song>(cacheKey, "json");
    if (cached) return c.json({ song: cached } satisfies VideoResponse);

    let found: { song: Song } | { reason: "not_found" | "not_embeddable" };
    let viaApi = true;
    try {
      found = await videoLookup(c.env.YOUTUBE_API_KEY, videoId);
    } catch (e) {
      if (!(e instanceof SearchUnavailableError)) throw e;
      // No key or no quota: pasted links still work through oEmbed (duration comes from the player later).
      found = await oembedLookup(videoId);
      viaApi = false;
    }
    if ("reason" in found) {
      logEvent(c.env, "video_lookup_failed", { reason: found.reason });
      return found.reason === "not_embeddable"
        ? apiError(c, 404, "not_embeddable", "That video can't be played outside YouTube")
        : apiError(c, 404, "not_found", "We couldn't find that video");
    }
    if (viaApi) await c.env.SEARCH_CACHE.put(cacheKey, JSON.stringify(found.song), { expirationTtl: VIDEO_TTL_SEC });
    return c.json({ song: found.song } satisfies VideoResponse);
  });
