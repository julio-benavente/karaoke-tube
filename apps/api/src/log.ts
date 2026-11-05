/**
 * Events: every key moment is written twice.
 *   1. as one JSON line in Workers Logs (live view, about 3 days on the Free plan; filter by field in the dashboard), and
 *   2. as a data point in Workers Analytics Engine (dataset `karaoke_tube_events`, 3 months, SQL-queryable, its own free
 *      allowance, fire-and-forget so it can never slow or break a party).
 *
 * Privacy rules: no nicknames, usernames, emails, join codes or keys. Only counts, enums, public YouTube ids, short
 * search text, and a short `room` id (from the Durable Object id) that ties the lines of one party together.
 *
 * Analytics Engine columns are positional, so EVENTS below is the schema. Column map for a data point:
 *   index1 = event, blob1 = room, blob2.. = the event's `strings` in order, double1.. = its `numbers` in order
 *   (true = 1, false = 0). Keep the order; add new fields at the end. docs/operations.md has the query cookbook.
 */
export const EVENTS = {
  room_created: { strings: ["lang"], numbers: ["signedIn"] },
  member_joined: { strings: [], numbers: ["members"] },
  song_added: { strings: ["status", "videoId"], numbers: ["duet", "byHost", "explicit"] },
  song_ended: { strings: ["videoId"], numbers: ["durationSec"] },
  song_unplayable: { strings: ["videoId", "channel"], numbers: [] },
  room_ended: { strings: ["reason", "lang"], numbers: ["songsPlayed", "songsSkipped", "members"] },
  room_error: { strings: ["code", "msg"], numbers: [] },
  handler_failed: { strings: ["msg"], numbers: [] },
  client_error: { strings: ["kind", "screen", "message", "stack", "version"], numbers: [] },
  search_fallback: { strings: ["query"], numbers: ["cached", "results"] },
  video_lookup_failed: { strings: ["reason"], numbers: [] },
  account_registered: { strings: [], numbers: [] },
  login_failed: { strings: [], numbers: [] },
} as const satisfies Record<string, { strings: readonly string[]; numbers: readonly string[] }>;

export type EventName = keyof typeof EVENTS;
type Fields = Record<string, string | number | boolean | null | undefined>;

/** Analytics Engine allows 16 KB of blobs per data point and 96 bytes of index. */
const BLOB_MAX = 600;

export function logEvent(env: { EVENTS?: AnalyticsEngineDataset } | undefined, event: EventName, fields: Fields = {}): void {
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
