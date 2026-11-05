/**
 * Events: every key moment is written twice.
 *   1. as one JSON line in Workers Logs (live view, about 3 days on the Free plan; filter by field in the dashboard), and
 *   2. as a data point in Workers Analytics Engine (dataset `karaoke_tube_events`, 3 months, SQL-queryable, its own free
 *      allowance, fire-and-forget so it can never slow or break a party).
 *
 * Privacy rules: no nicknames, usernames, emails, join codes or keys. Only counts, enums, public YouTube ids, short
 * search text, and a short `room` id (from the Durable Object id) that ties the lines of one party together.
 *
 * Priority: every event has a tier (1 = vital, 2 = actionable, 3 = high volume), and it adjusts itself. Each source (one
 * party, or one roomless event such as a client error) gets a budget per minute per tier. A normal party never reaches
 * it; a flood (crash loop, spammed room, bot) loses tier 3 first, then tier 2, and recovers the next minute. Tier 1 has a
 * very high last-resort cap. Whenever something was dropped, one `events_dropped` line says what and how much.
 * Manual override: EVENT_MAX_TIER in wrangler.jsonc (3 = everything, 2 = drop tier 3, 1 = only tier 1) and deploy.
 * Tier 1 alone still gives parties, songs per night (room_ended) and every error.
 * The budgets are per isolate (no shared counter, which would cost a request per event): good enough to bound a flood.
 *
 * Analytics Engine columns are positional, so EVENTS below is the schema. Column map for a data point:
 *   index1 = event, blob1 = room, blob2.. = the event's `strings` in order, double1.. = its `numbers` in order
 *   (true = 1, false = 0). Keep the order; add new fields at the end. docs/operations.md has the query cookbook.
 */
export const EVENTS = {
  // tier 1: never dropped. How many parties, how they end, and everything that is broken.
  room_created: { tier: 1, strings: ["lang"], numbers: ["signedIn"] },
  room_ended: { tier: 1, strings: ["reason", "lang"], numbers: ["songsPlayed", "songsSkipped", "members"] },
  handler_failed: { tier: 1, strings: ["msg"], numbers: [] },
  client_error: { tier: 1, strings: ["kind", "screen", "message", "stack", "version"], numbers: [] },
  account_registered: { tier: 1, strings: [], numbers: [] },
  login_failed: { tier: 1, strings: [], numbers: [] },
  events_dropped: { tier: 1, strings: ["source", "tier"], numbers: ["dropped"] },
  // tier 2: what we act on. Songs that fail, songs people want and we lack, refused actions.
  song_unplayable: { tier: 2, strings: ["videoId", "channel"], numbers: [] },
  search_fallback: { tier: 2, strings: ["query"], numbers: ["cached", "results"] },
  video_lookup_failed: { tier: 2, strings: ["reason"], numbers: [] },
  room_error: { tier: 2, strings: ["code", "msg"], numbers: [] },
  // tier 3: the busiest, and the ones room_ended already sums up (songs played, people). First to go.
  member_joined: { tier: 3, strings: [], numbers: ["members"] },
  song_added: { tier: 3, strings: ["status", "videoId"], numbers: ["duet", "byHost", "explicit"] },
  song_ended: { tier: 3, strings: ["videoId"], numbers: ["durationSec"] },
} as const satisfies Record<string, { tier: 1 | 2 | 3; strings: readonly string[]; numbers: readonly string[] }>;

export type EventName = keyof typeof EVENTS;
type Fields = Record<string, string | number | boolean | null | undefined>;

/** Analytics Engine allows 16 KB of blobs per data point and 96 bytes of index. */
const BLOB_MAX = 600;

/** Events allowed per source per minute, by tier. A 3-hour party averages about one event a minute. */
export const BUDGET_PER_MINUTE = { 1: 600, 2: 120, 3: 60 } as const;
const WINDOW_MS = 60_000;
const MAX_TRACKED = 2000;

type Window = { start: number; used: number; dropped: number };
const windows = new Map<string, Window>();
type Report = (source: string, tier: number, dropped: number) => void;

/**
 * True if this event fits its source's budget this minute. The first drop in a minute is reported at once (so a flood is
 * noticed even if the source then goes quiet), and the rest of that minute's drops are reported when the minute rolls
 * over; the reports add up to the total dropped.
 */
function withinBudget(tier: 1 | 2 | 3, source: string, now: number, report: Report): boolean {
  const key = `${tier}:${source}`;
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    if (w && w.dropped > 1) report(source, tier, w.dropped - 1);
    if (windows.size >= MAX_TRACKED) {
      // Too many sources tracked (a long-lived isolate): forget the expired ones, then the oldest half.
      for (const [k, old] of windows) if (now - old.start >= WINDOW_MS) windows.delete(k);
      let toDrop = windows.size >= MAX_TRACKED ? Math.floor(windows.size / 2) : 0;
      for (const k of windows.keys()) if (toDrop-- > 0) windows.delete(k);
    }
    w = { start: now, used: 0, dropped: 0 };
    windows.delete(key);
    windows.set(key, w);
  }
  if (w.used >= BUDGET_PER_MINUTE[tier]) {
    w.dropped++;
    if (w.dropped === 1) report(source, tier, 1);
    return false;
  }
  w.used++;
  return true;
}

/** Test helper: forget all budgets. */
export function resetBudgets() {
  windows.clear();
}

type LogEnv = { EVENTS?: AnalyticsEngineDataset; EVENT_MAX_TIER?: string };

/** The highest tier still recorded: 3 unless EVENT_MAX_TIER says 1 or 2. Anything unreadable means "everything". */
function maxTier(env: LogEnv | undefined): number {
  const n = Number(env?.EVENT_MAX_TIER);
  return n === 1 || n === 2 ? n : 3;
}

export function logEvent(env: LogEnv | undefined, event: EventName, fields: Fields = {}): void {
  const schema = EVENTS[event];
  if (schema.tier > maxTier(env)) return;
  // events_dropped itself is never budgeted, so it can always say what was lost.
  if (event !== "events_dropped") {
    const source = String(fields.room ?? event);
    const fits = withinBudget(schema.tier, source, Date.now(), (src, tier, dropped) => write(env, "events_dropped", { source: src, tier, dropped }));
    if (!fits) return;
  }
  write(env, event, fields);
}

function write(env: LogEnv | undefined, event: EventName, fields: Fields): void {
  console.log(JSON.stringify({ event, ...fields }));
  try {
    const schema = EVENTS[event];
    env?.EVENTS?.writeDataPoint({
      indexes: [event],
      blobs: [String(fields.room ?? ""), ...schema.strings.map((k) => String(fields[k] ?? "").slice(0, BLOB_MAX))],
      doubles: schema.numbers.map((k) => Number(fields[k] ?? 0)),
    });
  } catch {
    // Observability must never break the app.
  }
}
