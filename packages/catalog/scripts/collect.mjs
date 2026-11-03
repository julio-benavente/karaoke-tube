#!/usr/bin/env node
// Pulls every upload of the channels in data/catalog/channels.json from the YouTube Data API v3 into
// data/catalog/raw/<channel>.{playlist,videos}.jsonl. Raw and complete: each videos line is the full API resource
// (snippet incl. description/tags/thumbnails, contentDetails, statistics, status, topicDetails), so later steps
// (title parsing, the D1 import) can pick whatever they need without calling YouTube again.
//
// Quota: playlistItems.list = 1 unit per 50 videos, videos.list = 1 unit per 50 videos (any number of parts).
//
// Resumable: re-run it and it continues where it stopped (including after the daily quota runs out).
//
//   node --env-file=apps/api/.dev.vars packages/catalog/scripts/collect.mjs [--only sing-king,karafun] [--limit 200]
//
// The key is read from YOUTUBE_API_KEY and is never printed.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RAW_DIR = join(ROOT, "data/catalog/raw");
const API = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY;
const PARTS = "snippet,contentDetails,statistics,status,topicDetails";
const CONCURRENCY = 3;

if (!KEY) {
  console.error("YOUTUBE_API_KEY is not set (use --env-file=apps/api/.dev.vars)");
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const only = arg("only")?.split(",");
const limit = arg("limit") ? Number(arg("limit")) : Infinity;

class QuotaError extends Error {}

async function yt(path, params, attempt = 0) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", KEY);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    if (attempt < 5) return retry(path, params, attempt);
    throw e;
  }
  if (res.ok) return res.json();
  const body = await res.json().catch(() => null);
  const reasons = body?.error?.errors?.map((e) => e.reason) ?? [];
  if (res.status === 403 && reasons.some((r) => r === "quotaExceeded" || r === "dailyLimitExceeded")) {
    throw new QuotaError("YouTube daily quota used up");
  }
  if ((res.status >= 500 || res.status === 429 || reasons.includes("rateLimitExceeded")) && attempt < 5) {
    return retry(path, params, attempt);
  }
  throw new Error(`${path} ${res.status}: ${body?.error?.message ?? ""}`);
}
async function retry(path, params, attempt) {
  await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  return yt(path, params, attempt + 1);
}

const readLines = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

/** Step 1: every video id in the channel's uploads playlist ("UU" + channel id minus "UC"). */
async function listUploads(ch) {
  const file = join(RAW_DIR, `${ch.key}.playlist.jsonl`);
  const statePath = join(RAW_DIR, `${ch.key}.playlist.state.json`);
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { done: false, count: 0 };
  while (!state.done && state.count < limit) {
    const data = await yt("playlistItems", {
      part: "contentDetails",
      playlistId: `UU${ch.id.slice(2)}`,
      maxResults: "50",
      ...(state.nextPageToken ? { pageToken: state.nextPageToken } : {}),
    });
    const lines = (data.items ?? []).map((i) =>
      JSON.stringify({ videoId: i.contentDetails.videoId, publishedAt: i.contentDetails.videoPublishedAt ?? null }),
    );
    if (lines.length) appendFileSync(file, lines.join("\n") + "\n");
    state.count += lines.length;
    state.nextPageToken = data.nextPageToken;
    state.done = !data.nextPageToken;
    writeFileSync(statePath, JSON.stringify(state));
    if (state.count % 1000 < 50) console.log(`[${ch.key}] listed ${state.count}`);
  }
  return readLines(file).map((l) => l.videoId);
}

/** Step 2: full details for every listed id not fetched yet. Deleted/private ids are recorded as `{id, missing}`. */
async function fetchDetails(ch, ids) {
  const file = join(RAW_DIR, `${ch.key}.videos.jsonl`);
  const have = new Set(readLines(file).map((v) => v.id));
  const todo = ids.filter((id) => !have.has(id)).slice(0, Number.isFinite(limit) ? limit : undefined);
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const data = await yt("videos", { part: PARTS, id: batch.join(","), maxResults: "50" });
    const returned = new Set((data.items ?? []).map((v) => v.id));
    const lines = [
      ...(data.items ?? []).map((v) => JSON.stringify({ ...v, channelKey: ch.key })),
      ...batch.filter((id) => !returned.has(id)).map((id) => JSON.stringify({ id, channelKey: ch.key, missing: true })),
    ];
    appendFileSync(file, lines.join("\n") + "\n");
    if ((i / 50) % 20 === 0) console.log(`[${ch.key}] details ${have.size + i + batch.length}/${ids.length}`);
  }
  return readLines(file).length;
}

async function collect(ch) {
  const ids = await listUploads(ch);
  const n = await fetchDetails(ch, ids);
  console.log(`[${ch.key}] done: ${ids.length} listed, ${n} detailed`);
}

mkdirSync(RAW_DIR, { recursive: true });
const channels = JSON.parse(readFileSync(join(ROOT, "data/catalog/channels.json"), "utf8")).filter(
  (c) => !only || only.includes(c.key),
);

const queue = [...channels];
let failed = false;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length && !failed) {
      const ch = queue.shift();
      try {
        await collect(ch);
      } catch (e) {
        if (e instanceof QuotaError) {
          failed = true;
          console.error(`Stopped: ${e.message}. Re-run after midnight Pacific; it resumes where it left off.`);
        } else {
          console.error(`[${ch.key}] failed: ${e.message}`);
          process.exitCode = 1;
        }
      }
    }
  }),
);
if (failed) process.exit(2);
