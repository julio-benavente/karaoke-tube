// Raw YouTube video records in, compact `Catalog` out: filter out non-songs, clean titles, work out artist vs song,
// merge the same song across channels (and keys), pick the best version of each, sort by popularity.
// Pure: no file access, so it is unit-testable. `scripts/build.ts` does the reading and writing.

import { artistKey, orient, parseTitle, titleKey, type Order, type ParsedTitle } from "./parse.ts";
import type { Catalog } from "./types.ts";

export type ChannelConfig = {
  key: string;
  id: string;
  title: string;
  order: Order;
  /** Higher wins when the same song is on several channels. */
  priority: number;
  /** This channel writes titles in ALL CAPS. */
  tidyCase?: boolean;
  /** Reason to leave the whole channel out. */
  exclude?: string;
  /** See `ParseOptions`. */
  colonSplit?: boolean;
  karaokeSplit?: boolean;
};

/** The few fields of a YouTube `videos.list` record the build needs (`scripts/build.ts` trims the rest). */
export type RawVideo = {
  id: string;
  channelKey: string;
  title: string;
  durationSec: number;
  views: number;
  live: boolean;
  isPublic: boolean;
};

type Entry = {
  video: RawVideo;
  channelIdx: number;
  channel: ChannelConfig;
  parsed: ParsedTitle;
};

type Placed = Entry & { artist: string | null; title: string; certain: boolean; score: number };

export type BuildReport = {
  input: number;
  excluded: Record<string, number>;
  kept: number;
  songs: number;
  withArtist: number;
  withoutArtist: number;
  uncertainOrder: number;
  mergedSongs: number;
  keptPerChannel: Record<string, number>;
  samples: { random: string[]; noArtist: string[]; uncertain: string[]; merged: string[] };
};

export const MIN_SECONDS = 60;
export const MAX_SECONDS = 15 * 60;
const COMPILATION = /compilation|non-?stop|\btop \d+\b|\b\d+\s*hours?\b|\bplaylist\b|\b(?:best|top|greatest)\b.{0,40}\bsongs\b|& more\b|\bbest of\b|\breview\b|\bapp for\b/i;
const SHORT = /#(?:shorts?|quiz|guessthesong)\b/i;
/** Real tracks always say so. Channel chatter ("Soundcheck Episode 7", "Vocal Warm Up") doesn't. */
const KARAOKE_MARKER = /karaoke|karaokê|instrumental|vocal-?star|lyrics|letra|backing|sing[- ]?along|piano/i;
const MAX_ALTS = 5;

const VARIANT_PENALTY: Array<[RegExp, number]> = [
  [/lower key|higher key|male key|female key/, 40],
  [/vocal guide/, 5],
];

/** `PT4M10S` -> 250. */
export function parseDuration(iso: string | undefined): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Math.round(Number(m[4] ?? 0));
}

function excludeReason(v: RawVideo, ch: ChannelConfig): string | null {
  if (ch.exclude) return `channel: ${ch.key}`;
  if (!v.isPublic) return "not public";
  if (v.live) return "live or upcoming";
  if (SHORT.test(v.title) || v.durationSec < MIN_SECONDS) return "short or under a minute";
  if (v.durationSec > MAX_SECONDS) return "over 15 minutes";
  if (COMPILATION.test(v.title)) return "compilation";
  if (!KARAOKE_MARKER.test(v.title)) return "no karaoke wording (not a track)";
  return null;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], n: number, rand: () => number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  return out;
}

export function buildCatalog(
  videos: Iterable<RawVideo>,
  channels: ChannelConfig[],
  now = new Date(),
): { catalog: Catalog; report: BuildReport } {
  const byKey = new Map(channels.map((c, i) => [c.key, { c, i }]));
  const excluded: Record<string, number> = {};
  const skip = (why: string) => (excluded[why] = (excluded[why] ?? 0) + 1);
  let input = 0;

  // 1. Filter and parse.
  const entries: Entry[] = [];
  for (const video of videos) {
    input++;
    const ch = byKey.get(video.channelKey);
    if (!ch) {
      skip("unknown channel");
      continue;
    }
    const why = excludeReason(video, ch.c);
    if (why) {
      skip(why);
      continue;
    }
    const parsed = parseTitle(video.title, { colonSplit: ch.c.colonSplit, karaokeSplit: ch.c.karaokeSplit });
    entries.push({ video, channel: ch.c, channelIdx: ch.i, parsed });
  }

  // 2. Which names are artists? Learn it from channels (and title patterns) whose order is known.
  const knownArtists = new Map<string, number>();
  for (const e of entries) {
    if (e.channel.order === "mixed" && !e.parsed.ordered) continue;
    const o = orient(e.parsed, e.channel.order, undefined, { tidy: e.channel.tidyCase });
    if (o.artist) knownArtists.set(artistKey(o.artist), (knownArtists.get(artistKey(o.artist)) ?? 0) + 1);
  }
  const artistScore = (name: string) => knownArtists.get(artistKey(name)) ?? 0;

  // 3a. Orient every title (artist vs song). Note which songs are known for sure, and how each mixed channel
  // usually writes its titles.
  const songKey = (artist: string | null, title: string) => `${artist ? artistKey(artist) : ""}|${titleKey(title)}`;
  const first = entries.map((e) => ({
    e,
    o: orient(e.parsed, e.channel.order, artistScore, { tidy: e.channel.tidyCase }),
  }));
  const certainKeys = new Set<string>();
  const tally = new Map<string, { artistFirst: number; songFirst: number }>();
  for (const { e, o } of first) {
    if (!o.certain || !o.artist) continue;
    certainKeys.add(songKey(o.artist, o.title));
    if (e.channel.order === "mixed" && e.parsed.segments.length === 2) {
      const t = tally.get(e.channel.key) ?? { artistFirst: 0, songFirst: 0 };
      if (o.artist === e.parsed.segments[0]) t.artistFirst++;
      else t.songFirst++;
      tally.set(e.channel.key, t);
    }
  }

  // 3b. Settle the uncertain ones: another channel already has this exact song in one of the two orders (strong
  // evidence), otherwise go with how this channel usually writes titles.
  const placed: Placed[] = [];
  for (const { e, o: o1 } of first) {
    let o = o1;
    if (!o.certain) {
      const t = tally.get(e.channel.key);
      const prefer = t && t.songFirst > t.artistFirst ? "song-first" : "artist-first";
      let parsed = e.parsed;
      if (parsed.segments.length === 2) {
        const [a, b] = parsed.segments as [string, string];
        const artistFirst = certainKeys.has(songKey(a, b));
        const songFirst = certainKeys.has(songKey(b, a));
        if (artistFirst !== songFirst) parsed = { ...parsed, ordered: artistFirst ? "artist-first" : "song-first" };
      }
      o = orient(parsed, e.channel.order, artistScore, { tidy: e.channel.tidyCase, prefer });
    }
    if (!titleKey(o.title)) {
      skip("nothing left of the title");
      continue;
    }
    let score = e.channel.priority + Math.log10(e.video.views + 1) * 2;
    for (const [re, penalty] of VARIANT_PENALTY) if (re.test(e.parsed.variant)) score -= penalty;
    placed.push({ ...e, artist: o.artist, title: o.title, certain: o.certain, score });
  }

  // 4. Same song = same artist key + title key.
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    const key = `${p.artist ? artistKey(p.artist) : ""}|${titleKey(p.title)}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  // 5. One song per group: the best-scoring video, the rest as alternates. Most popular first.
  type Song = { best: Placed; rest: Placed[]; views: number };
  const songs: Song[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => b.score - a.score);
    songs.push({ best: g[0]!, rest: g.slice(1, 1 + MAX_ALTS), views: g.reduce((n, p) => n + p.video.views, 0) });
  }
  songs.sort((a, b) => b.views - a.views || a.best.title.localeCompare(b.best.title));

  const artists: string[] = [];
  const artistIdx = new Map<string, number>();
  const catalog: Catalog = {
    v: 1,
    built: now.toISOString(),
    channels: channels.map((c) => c.title),
    artists,
    songs: { t: [], a: [], id: [], d: [], c: [], p: [] },
    alts: {},
  };
  songs.forEach((s, i) => {
    const { best } = s;
    let a = -1;
    if (best.artist) {
      a = artistIdx.get(best.artist) ?? -1;
      if (a === -1) {
        a = artists.push(best.artist) - 1;
        artistIdx.set(best.artist, a);
      }
    }
    catalog.songs.t.push(best.title);
    catalog.songs.a.push(a);
    catalog.songs.id.push(best.video.id);
    catalog.songs.d.push(best.video.durationSec);
    catalog.songs.c.push(best.channelIdx);
    catalog.songs.p.push(Math.min(255, Math.round(Math.log10(s.views + 1) * 25)));
    if (s.rest.length) {
      catalog.alts[i] = s.rest.map((r) => [r.video.id, r.channelIdx, r.video.durationSec, r.parsed.variant]);
    }
  });

  // 6. A report to eyeball.
  const label = (p: Placed) => `${p.artist ?? "?"} | ${p.title}   <- ${p.video.title}  [${p.channel.key}]`;
  const rand = rng(11);
  const keptPerChannel: Record<string, number> = {};
  for (const p of placed) keptPerChannel[p.channel.key] = (keptPerChannel[p.channel.key] ?? 0) + 1;
  const bests = songs.map((s) => s.best);
  const report: BuildReport = {
    input,
    excluded,
    kept: placed.length,
    songs: songs.length,
    withArtist: bests.filter((p) => p.artist).length,
    withoutArtist: bests.filter((p) => !p.artist).length,
    uncertainOrder: bests.filter((p) => !p.certain).length,
    mergedSongs: songs.filter((s) => s.rest.length).length,
    keptPerChannel,
    samples: {
      random: pick(bests, 25, rand).map(label),
      noArtist: pick(bests.filter((p) => !p.artist), 20, rand).map(label),
      uncertain: pick(bests.filter((p) => !p.certain), 20, rand).map(label),
      merged: pick(songs.filter((s) => s.rest.length > 1), 10, rand).map(
        (s) => `${s.best.artist ?? "?"} | ${s.best.title}  x${1 + s.rest.length}: ${[s.best, ...s.rest].map((p) => `${p.channel.key}${p.parsed.variant ? ` (${p.parsed.variant})` : ""}`).join(", ")}`,
      ),
    },
  };
  return { catalog, report };
}
