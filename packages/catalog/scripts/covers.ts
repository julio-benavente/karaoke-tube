// Finds album cover art for the catalog songs and writes the sidecar apps/web/public/catalog/covers.json.
// Covers are hotlinked (Apple / Deezer CDNs); no image files are downloaded. catalog.json is only read.
//
//   pnpm --filter @karaoke-tube/catalog covers --sample          300-song test (top 200 + 100 spread over languages/eras), writes a sample file only
//   pnpm --filter @karaoke-tube/catalog covers --top 2000        the 2000 most popular songs
//   pnpm --filter @karaoke-tube/catalog covers --all             every song (hours; see the rate notes below)
//   pnpm --filter @karaoke-tube/catalog covers --all --build-only   rebuild covers.json from the cache, no network (also use to change thresholds)
//
// Options: --sources deezer,itunes (order = priority)  --strategy fallback|all  --min-confidence 0.85  --show 30  --out path
//   fallback (default): the next source is only asked about songs the previous ones could not match.
//   all (default with --sample): every source is asked about every song, to compare them.
//
// Resumable: every raw response is appended to data/catalog/raw/covers/<source>.jsonl (gitignored) and read back first,
// so a rerun only asks for what is missing. Songs go most popular first. Ctrl+C is safe; rerun to continue.
// Rate limits (measured): iTunes answers 429 (Retry-After ~28 s) after ~20 rapid requests, then 403 with an empty body
// while the IP is penalised; so it runs at one request per 3.1 s and backs off on 403/429. Deezer: 50 requests / 5 s.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { DEFAULT_MIN_CONFIDENCE, pickBest, prepareSong, type Match, type Pick, type Song } from "../src/cover-match.ts";
import { ADAPTERS, splitArtwork, type Adapter, type SourceKey } from "../src/cover-sources.ts";
import type { CoversFile } from "../src/covers.ts";
import { isCatalog, type AnyCatalog } from "../src/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CATALOG_FILE = join(ROOT, "apps/web/public/catalog/catalog.json");
const CACHE_DIR = join(ROOT, "data/catalog/raw/covers");
const COVERS_FILE = join(ROOT, "apps/web/public/catalog/covers.json");

// ---------------------------------------------------------------------------------------------------------------------
// Arguments

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const mode = flag("sample") ? "sample" : flag("all") ? "all" : opt("top") ? "top" : null;
if (!mode) {
  console.error("Usage: covers --sample | --top N | --all   [--build-only] [--sources deezer,itunes] [--strategy fallback|all] [--min-confidence 0.85] [--show 30] [--out file]");
  process.exit(1);
}
const sourceKeys = (opt("sources") ?? "deezer,itunes").split(",").map((s) => s.trim()) as SourceKey[];
for (const k of sourceKeys) if (!(k in ADAPTERS)) throw new Error(`unknown source "${k}"`);
const adapters: Adapter[] = sourceKeys.map((k) => ADAPTERS[k]);
const strategy = (opt("strategy") ?? (mode === "sample" ? "all" : "fallback")) as "fallback" | "all";
const minConfidence = Number(opt("min-confidence") ?? DEFAULT_MIN_CONFIDENCE);
const buildOnly = flag("build-only");
const show = Number(opt("show") ?? (mode === "sample" ? 30 : 0));
const prefix = mode === "sample" ? "sample-" : "";
const OUT_FILE = opt("out") ? resolve(opt("out")!) : mode === "sample" ? join(CACHE_DIR, "sample-covers.json") : mode === "top" ? join(CACHE_DIR, `top-${opt("top")}-covers.json`) : COVERS_FILE;

mkdirSync(CACHE_DIR, { recursive: true });

// ---------------------------------------------------------------------------------------------------------------------
// Catalog and song selection

const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as AnyCatalog;
if (!isCatalog(catalog)) throw new Error("unsupported catalog version");
const N = catalog.songs.t.length;
const prepared = Array.from({ length: N }, (_, i) => {
  const a = catalog.songs.a[i]!;
  return prepareSong(catalog.songs.t[i]!, a >= 0 ? (catalog.artists[a] ?? null) : null);
});
const songOf = (i: number): Song | null => {
  const p = prepared[i]!;
  return "song" in p ? p.song : null;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function selectSongs(): number[] {
  if (mode === "all") return Array.from({ length: N }, (_, i) => i);
  if (mode === "top") return Array.from({ length: Math.min(N, Number(opt("top"))) }, (_, i) => i);
  // sample: the top 200, plus 100 more spread over Spanish/Latin, old, obscure and random songs
  const rand = mulberry32(Number(opt("seed") ?? 7));
  const chosen = new Set<number>(Array.from({ length: Math.min(200, N) }, (_, i) => i));
  const take = (pool: number[], k: number) => {
    const free = pool.filter((i) => !chosen.has(i));
    for (let j = 0; j < k && free.length; j++) chosen.add(free.splice(Math.floor(rand() * free.length), 1)[0]!);
  };
  const all = Array.from({ length: N - 200 }, (_, i) => i + 200);
  const labels = "l" in catalog.songs ? catalog.songs : null; // v1 catalogs have no language / decade
  take(all.filter((i) => labels?.l[i] === "es"), 35);
  take(all.filter((i) => (labels?.y[i] ?? 0) > 0 && labels!.y[i]! <= 196), 15);
  take(all.filter((i) => i >= N * 0.6), 25);
  take(all, 25);
  return [...chosen].sort((a, b) => a - b);
}
const selected = selectSongs();

// ---------------------------------------------------------------------------------------------------------------------
// Disk cache: one JSONL per source, {u: request URL, b: raw JSON body}

type SourceState = {
  ad: Adapter;
  cache: Map<string, unknown>;
  file: string;
  interval: number;
  nextAt: number;
  blockedUntil: number;
  strikes: number;
  ok: number;
  cached: number;
  limited: number;
  netErrors: number;
  totalMs: number;
  matched: number;
  looked: number;
};

const states = new Map<SourceKey, SourceState>(
  adapters.map((ad) => {
    const file = join(CACHE_DIR, `${ad.key}.jsonl`);
    const cache = new Map<string, unknown>();
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const { u, b } = JSON.parse(line) as { u: string; b: unknown };
          cache.set(u, b);
        } catch {
          // a torn last line after a hard stop: ignore it, it gets fetched again
        }
      }
    }
    return [ad.key, { ad, cache, file, interval: ad.intervalMs, nextAt: 0, blockedUntil: 0, strikes: 0, ok: 0, cached: 0, limited: 0, netErrors: 0, totalMs: 0, matched: 0, looked: 0 }];
  }),
);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function gate(st: SourceState) {
  const now = Date.now();
  const at = Math.max(now, st.nextAt, st.blockedUntil);
  st.nextAt = at + st.interval;
  if (at > now) await sleep(at - now);
}

/** The raw body for `url`: from the cache, else from the network (throttled, backing off on 403/429). null = gave up. */
async function getBody(st: SourceState, url: string): Promise<unknown | null> {
  const hit = st.cache.get(url);
  if (hit !== undefined) {
    st.cached++;
    return hit;
  }
  for (let attempt = 0; ; attempt++) {
    await gate(st);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: "application/json" } });
    } catch {
      st.netErrors++;
      if (attempt >= 4) return null;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const ms = Date.now() - t0;
    if (res.status === 200) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return null;
      }
      const err = (body as { error?: { code?: number; message?: string } } | null)?.error;
      if (err) {
        // Deezer reports its limit as HTTP 200 + {error:{code:4}}
        st.limited++;
        penalize(st, 6000, `${st.ad.key} error ${err.code ?? ""} ${err.message ?? ""}`);
        if (err.code === 4 || attempt < 3) continue;
        return null;
      }
      st.ok++;
      st.totalMs += ms;
      st.strikes = 0;
      st.cache.set(url, body);
      appendFileSync(st.file, `${JSON.stringify({ u: url, b: body })}\n`);
      return body;
    }
    if (res.status === 429 || res.status === 403 || res.status === 503) {
      st.limited++;
      st.strikes++;
      if (st.strikes > 24) throw new Error(`${st.ad.key} keeps answering ${res.status}; stop, wait an hour, and rerun (progress is cached)`);
      const retryAfter = Number(res.headers.get("retry-after"));
      // 429 carries Retry-After; the 403 that follows has none and lasts minutes: 60 s, doubling, up to 15 min.
      const wait = retryAfter > 0 ? retryAfter * 1000 + 1000 : Math.min(15 * 60_000, 60_000 * 2 ** Math.min(st.strikes - 1, 4));
      st.interval = Math.min(st.ad.intervalMs * 3, st.interval * 1.2);
      penalize(st, wait + Math.random() * 2000, `${st.ad.key} HTTP ${res.status}`);
      continue;
    }
    if (attempt >= 2) return null;
    await sleep(1500);
  }
}

function penalize(st: SourceState, ms: number, why: string) {
  st.blockedUntil = Math.max(st.blockedUntil, Date.now() + ms);
  console.log(`[${st.ad.key}] ${why}: pausing ${(ms / 1000).toFixed(0)}s (interval now ${st.interval.toFixed(0)} ms)`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lookup run: sources are chained (fallback) or independent (all), run in parallel with each other

class Queue {
  private items: number[] = [];
  private waiters: Array<(v: number | undefined) => void> = [];
  private closed = false;
  push(v: number) {
    const w = this.waiters.shift();
    if (w) w(v);
    else this.items.push(v);
  }
  close() {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w(undefined);
  }
  next(): Promise<number | undefined> {
    if (this.items.length) return Promise.resolve(this.items.shift());
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((r) => this.waiters.push(r));
  }
}

const startedAt = Date.now();
function progress(st: SourceState, total: number, force = false) {
  const n = st.ok + st.cached;
  if (!force && st.ok % 25 !== 0) return;
  const rate = st.ok ? st.ok / ((Date.now() - startedAt) / 1000) : 0;
  console.log(`[${st.ad.key}] ${n}/${total} looked up (${st.cached} from cache, ${st.ok} fetched, ${rate.toFixed(2)}/s, avg ${st.ok ? Math.round(st.totalMs / st.ok) : 0} ms, ${st.limited} throttled) matched ${st.matched}`);
}

async function runLookups() {
  const queues = adapters.map(() => new Queue());
  const todo = selected.filter((i) => songOf(i));
  for (const q of queues.slice(0, strategy === "all" ? queues.length : 1)) for (const i of todo) q.push(i);
  queues[0]!.close();
  if (strategy === "all") queues.forEach((q) => q.close());
  const total = todo.length;
  await Promise.all(
    adapters.map(async (ad, k) => {
      const st = states.get(ad.key)!;
      const worker = async () => {
        for (let i = await queues[k]!.next(); i !== undefined; i = await queues[k]!.next()) {
          const song = songOf(i)!;
          const body = await getBody(st, ad.url(song));
          st.looked++;
          const pick = body === null ? null : pickBest(song, ad.parse(body), minConfidence);
          if (pick?.best) st.matched++;
          else if (strategy === "fallback") queues[k + 1]?.push(i);
          progress(st, total);
        }
      };
      await Promise.all(Array.from({ length: ad.concurrency }, worker));
      if (strategy === "fallback") queues[k + 1]?.close();
      progress(st, total, true);
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Build: evaluate the cached responses (no network) and write covers.json, matches.json and unmatched.json

type SongResult = { source: SourceKey; pick: Pick };

function buildOutputs() {
  const sources: Record<string, string> = {};
  const keyOfTemplate = new Map<string, string>();
  const keyFor = (source: SourceKey, template: string) => {
    let key = keyOfTemplate.get(template);
    if (!key) {
      key = Object.keys(sources).some((k) => k.split("~")[0] === source) ? `${source}~${Object.keys(sources).filter((k) => k.split("~")[0] === source).length}` : source;
      keyOfTemplate.set(template, key);
      sources[key] = template;
    }
    return key;
  };
  const art: CoversFile["art"] = [];
  const artIndex = new Map<string, number>();
  const c = new Array<number>(N).fill(-1);
  const matches: Record<number, unknown> = {};
  const unmatched: Array<{ i: number; artist: string; title: string; reasons: Record<string, string> }> = [];
  const considered = new Set(selected);
  const counts = { considered: 0, noArtist: 0, withCover: 0, notQueried: 0, imageShape: 0 };
  const alone = Object.fromEntries(sourceKeys.map((k) => [k, 0])) as Record<string, number>;
  const queriedBy = Object.fromEntries(sourceKeys.map((k) => [k, 0])) as Record<string, number>;
  const winners = { ...alone };
  const examples: Array<{ i: number; match: Match; source: SourceKey }> = [];
  const misses: Array<{ i: number; reasons: Record<string, string> }> = [];

  for (const i of selected) {
    if (!considered.has(i)) continue;
    counts.considered++;
    const song = songOf(i);
    const artist = catalog.artists[catalog.songs.a[i]!] ?? "";
    const title = catalog.songs.t[i]!;
    if (!song) {
      counts.noArtist++;
      unmatched.push({ i, artist, title, reasons: { all: (prepared[i] as { skip: string }).skip } });
      continue;
    }
    const results: SongResult[] = [];
    const reasons: Record<string, string> = {};
    for (const ad of adapters) {
      const body = states.get(ad.key)!.cache.get(ad.url(song));
      if (body === undefined) {
        reasons[ad.key] = "not queried";
        continue;
      }
      queriedBy[ad.key]!++;
      const pick = pickBest(song, ad.parse(body), minConfidence);
      results.push({ source: ad.key, pick });
      if (pick.best) alone[ad.key]!++;
      else reasons[ad.key] = pick.reason;
    }
    matches[i] = {
      artist: song.artist,
      title: song.title,
      results: Object.fromEntries(results.map((r) => [r.source, { matched: !!r.pick.best, top: r.pick.viable.slice(0, 3).map((m) => ({ ...m, confidence: Number(m.confidence.toFixed(3)) })) }])),
    };
    // highest confidence wins, ties go to the source listed first
    let winner: SongResult | null = null;
    for (const r of results) if (r.pick.best && (!winner || r.pick.best.confidence > winner.pick.best!.confidence + 1e-9)) winner = r;
    if (!winner?.pick.best) {
      if (results.length === 0) counts.notQueried++;
      else {
        unmatched.push({ i, artist: song.artist, title, reasons });
        if (misses.length < 400) misses.push({ i, reasons });
      }
      continue;
    }
    const split = splitArtwork(winner.pick.best.image);
    if (!split) {
      counts.imageShape++;
      unmatched.push({ i, artist: song.artist, title, reasons: { ...reasons, [winner.source]: `image URL shape: ${winner.pick.best.image}` } });
      continue;
    }
    const key = keyFor(winner.source, split.template);
    const id = `${key}\0${split.p}`;
    let a = artIndex.get(id);
    if (a === undefined) {
      a = art.length;
      art.push({ s: key, p: split.p });
      artIndex.set(id, a);
    }
    c[i] = a;
    counts.withCover++;
    winners[winner.source]!++;
    examples.push({ i, match: winner.pick.best, source: winner.source });
  }

  const file: CoversFile = {
    v: 1,
    built: new Date().toISOString(),
    catalogBuilt: catalog.built,
    songCount: N,
    sources,
    art,
    c,
  };
  const json = JSON.stringify(file);
  writeFileSync(OUT_FILE, json);
  writeFileSync(join(CACHE_DIR, `${prefix}matches.json`), JSON.stringify({ catalogBuilt: catalog.built, minConfidence, songs: matches }));
  writeFileSync(join(CACHE_DIR, `${prefix}unmatched.json`), JSON.stringify(unmatched, null, 1));

  const pct = (k: number, of: number) => (of ? `${((100 * k) / of).toFixed(1)}%` : "-");
  console.log(`\n=== ${mode} run: ${counts.considered} songs considered of ${N} (min confidence ${minConfidence}, strategy ${strategy}) ===`);
  console.log(`with cover      ${counts.withCover} (${pct(counts.withCover, counts.considered)})`);
  console.log(`without cover   ${counts.considered - counts.withCover} (no artist to search: ${counts.noArtist}, not queried yet: ${counts.notQueried}, unusable image URL: ${counts.imageShape})`);
  const lookedUp = counts.considered - counts.noArtist - counts.notQueried;
  console.log(`hit rate (of songs looked up): ${pct(counts.withCover, lookedUp)}`);
  for (const k of sourceKeys) console.log(`  ${k.padEnd(7)} alone: ${alone[k]}/${queriedBy[k]} (${pct(alone[k]!, queriedBy[k]!)}), chosen for ${winners[k]} songs`);
  for (const st of states.values()) if (st.ok) console.log(`  ${st.ad.key.padEnd(7)} ${st.ok} requests, avg ${Math.round(st.totalMs / st.ok)} ms each, ${st.limited} throttled`);
  console.log(`art: ${art.length} unique covers; sources: ${JSON.stringify(sources)}`);
  console.log(`${OUT_FILE.replace(ROOT, ".")}: ${(json.length / 1024).toFixed(0)} KB (gzip ${(gzipSync(json).length / 1024).toFixed(0)}, brotli ${(brotliCompressSync(json).length / 1024).toFixed(0)})`);
  console.log(`unmatched list: ${join(CACHE_DIR, `${prefix}unmatched.json`).replace(ROOT, ".")}`);

  if (show > 0) {
    const rand = mulberry32(99);
    const pool = [...examples];
    console.log(`\n--- ${Math.min(show, pool.length)} random matches (catalog -> match [album] confidence, source) ---`);
    for (let j = 0; j < show && pool.length; j++) {
      const e = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
      console.log(`#${e.i} ${catalog.artists[catalog.songs.a[e.i]!] ?? "?"} - ${catalog.songs.t[e.i]}  ->  ${e.match.artist} - ${e.match.title} [${e.match.album}] ${e.match.confidence.toFixed(2)} ${e.source}`);
    }
    console.log(`\n--- 10 misses ---`);
    for (const m of misses.slice(0, 10)) console.log(`#${m.i} ${catalog.artists[catalog.songs.a[m.i]!] ?? "?"} - ${catalog.songs.t[m.i]}  |  ${Object.entries(m.reasons).map(([k, v]) => `${k}: ${v}`).join("  |  ")}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------

process.on("SIGINT", () => {
  console.log("\nstopped; building from what is cached (rerun to continue)");
  buildOutputs();
  process.exit(0);
});

console.log(`${selected.length} songs selected (${mode}); sources: ${sourceKeys.join(" > ")}; cache: ${[...states.values()].map((s) => `${s.ad.key} ${s.cache.size}`).join(", ")} responses`);
if (!buildOnly) await runLookups();
buildOutputs();
