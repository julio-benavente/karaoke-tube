/**
 * Events: every key moment is written twice.
 *   1. as one JSON line in Workers Logs (live view, about 3 days on the Free plan; filter by field in the dashboard), and
 *   2. as a data point in Workers Analytics Engine (dataset `karaoke_tube_events`, 3 months, SQL-queryable, its own free
 *      allowance, fire-and-forget so it can never slow or break a party).
 *
 * Privacy rules: no nicknames, usernames, emails, join codes or keys. Only counts, enums, public YouTube ids, short
 * search text, and a short `room` id (from the Durable Object id) that ties the lines of one party together.
 *
 * Priority: every event has a tier (1 = vital, 2 = actionable, 3 = high volume). If we ever near a free limit, set
 * EVENT_MAX_TIER in wrangler.jsonc (3 = everything, 2 = drop tier 3, 1 = only tier 1) and deploy: events above it are
 * neither logged nor stored. Tier 1 alone still gives parties, songs per night (room_ended) and every error.
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

type LogEnv = { EVENTS?: AnalyticsEngineDataset; EVENT_MAX_TIER?: string };

/** The highest tier still recorded: 3 unless EVENT_MAX_TIER says 1 or 2. Anything unreadable means "everything". */
function maxTier(env: LogEnv | undefined): number {
  const n = Number(env?.EVENT_MAX_TIER);
  return n === 1 || n === 2 ? n : 3;
}

export function logEvent(env: LogEnv | undefined, event: EventName, fields: Fields = {}): void {
  const schema = EVENTS[event];
  if (schema.tier > maxTier(env)) return;
  console.log(JSON.stringify({ event, ...fields }));
  try {
    env?.EVENTS?.writeDataPoint({
      indexes: [event],
      blobs: [String(fields.room ?? ""), ...schema.strings.map((k) => String(fields[k] ?? "").slice(0, BLOB_MAX))],
      doubles: schema.numbers.map((k) => Number(fields[k] ?? 0)),
    });
  } catch {
    // Observability must never break the app.
  }
}
