/**
 * One JSON line per event, so Workers Logs can filter and count them by field (event = "song_added", lang = "es", ...).
 * Read them in the Cloudflare dashboard (Workers -> karaoke-tube -> Logs) or live with `pnpm wrangler tail`.
 *
 * Rules: no nicknames, no emails, no room codes, no keys. Only ids that are already public (YouTube video ids) and
 * counts/enums. A short `room` id (from the Durable Object id) ties the lines of one party together.
 */
export function logEvent(event: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  console.log(JSON.stringify({ event, ...fields }));
}
