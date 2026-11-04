import type { Song } from "@karaoke-tube/shared";

const API = "https://www.googleapis.com/youtube/v3";
export const SEARCH_RESULTS = 15;
export const SEARCH_TTL_SEC = 7 * 24 * 60 * 60;
export const VIDEO_TTL_SEC = 30 * 24 * 60 * 60;

/** YouTube said no because the daily quota is used up (or the key is missing/invalid). */
export class SearchUnavailableError extends Error {}

/** Lowercase, trimmed, single spaces: the cache key for a search. */
export function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** A video id from an id or any common YouTube URL (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`). */
export function parseVideoId(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID_RE.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[1]!;
  }
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

/** ISO 8601 duration (`PT1H2M3S`) to seconds. */
export function parseDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Math.round(Number(s ?? 0));
}

type Thumbs = Record<string, { url: string } | undefined>;
type VideoResource = {
  id: string;
  snippet?: { title: string; channelTitle: string; thumbnails?: Thumbs; liveBroadcastContent?: string };
  contentDetails?: { duration: string };
  status?: { embeddable?: boolean };
};

async function call<T>(apiKey: string | undefined, path: string, params: Record<string, string>): Promise<T> {
  if (!apiKey) throw new SearchUnavailableError("YOUTUBE_API_KEY is not set");
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  if (res.ok) return res.json<T>();
  const body = await res.json<{ error?: { errors?: Array<{ reason?: string }>; message?: string } }>().catch(() => null);
  const reasons = body?.error?.errors?.map((e) => e.reason) ?? [];
  if (res.status === 403 && reasons.some((r) => r === "quotaExceeded" || r === "dailyLimitExceeded" || r === "rateLimitExceeded")) {
    throw new SearchUnavailableError("YouTube quota exceeded");
  }
  if (res.status === 400 && reasons.includes("keyInvalid")) throw new SearchUnavailableError("YouTube API key is invalid");
  throw new Error(`YouTube ${path} failed: ${res.status} ${body?.error?.message ?? ""}`);
}

function toSong(v: VideoResource): Song | null {
  if (!v.snippet || !v.contentDetails) return null;
  const t = v.snippet.thumbnails ?? {};
  const thumb = t.medium ?? t.high ?? t.default ?? Object.values(t).find(Boolean);
  return {
    videoId: v.id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    durationSec: parseDuration(v.contentDetails.duration),
    thumbnailUrl: thumb?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
  };
}

async function videosById(apiKey: string | undefined, ids: string[]): Promise<Map<string, Song>> {
  if (ids.length === 0) return new Map();
  const data = await call<{ items?: VideoResource[] }>(apiKey, "videos", { part: "snippet,contentDetails,status", id: ids.join(",") });
  const songs = new Map<string, Song>();
  for (const v of data.items ?? []) {
    // The TV plays in YouTube's embedded player, which refuses videos whose owner turned embedding off (most of
    // KaraFun and Sing King's newer uploads): leave them out instead of offering songs that skip.
    if (v.status?.embeddable === false) continue;
    if (v.snippet?.liveBroadcastContent === "live") continue;
    const song = toSong(v);
    if (song) songs.set(v.id, song);
  }
  return songs;
}

/** `search.list` for `<query> karaoke`, then `videos.list` for durations. Keeps YouTube's ranking. */
export async function searchYouTube(apiKey: string | undefined, query: string): Promise<Song[]> {
  const data = await call<{ items?: Array<{ id?: { videoId?: string } }> }>(apiKey, "search", {
    part: "id",
    type: "video",
    maxResults: String(SEARCH_RESULTS),
    q: `${query} karaoke`,
  });
  const ids = (data.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => !!id);
  const songs = await videosById(apiKey, ids);
  return ids.map((id) => songs.get(id)).filter((s): s is Song => !!s);
}

/**
 * Title, channel and thumbnail from YouTube's oEmbed endpoint: no API key, no quota. No duration (0); the player
 * reports it once the video loads. Returns null when the video doesn't exist or can't be embedded.
 */
export async function oembedSong(videoId: string): Promise<Song | null> {
  const url = new URL("https://www.youtube.com/oembed");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  if (!res.ok) return null; // 400/404: no such video, 401: embedding disabled
  const data = await res.json<{ title?: string; author_name?: string }>();
  if (!data.title) return null;
  return {
    videoId,
    title: data.title,
    channel: data.author_name ?? "",
    durationSec: 0,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}

export async function videoDetails(apiKey: string | undefined, videoId: string): Promise<Song | null> {
  return (await videosById(apiKey, [videoId])).get(videoId) ?? null;
}
