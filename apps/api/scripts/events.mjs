#!/usr/bin/env node
// Asks the Analytics Engine dataset `karaoke_tube_events` a question (SQL over HTTP). Columns: see apps/api/src/log.ts.
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node apps/api/scripts/events.mjs <preset> [days]
//   presets: summary | parties | unplayable | misses | errors | client | endings | "<any SQL>"
//
// The token needs only "Account Analytics: Read" (dash.cloudflare.com/profile/api-tokens). It is read from the
// environment and never printed. Counts use SUM(_sample_interval), which stays right if Cloudflare ever samples.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (token scope: Account Analytics: Read).");
  process.exit(1);
}

const [what = "summary", daysArg = "7"] = process.argv.slice(2);
const days = Math.max(1, Math.min(90, Number(daysArg) || 7));
const T = "karaoke_tube_events";
const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

const PRESETS = {
  // How much of everything happened.
  summary: `SELECT index1 AS event, SUM(_sample_interval) AS n FROM ${T} WHERE ${since} GROUP BY event ORDER BY n DESC`,
  // Parties per day, in the two languages.
  parties: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS lang, SUM(_sample_interval) AS parties FROM ${T} WHERE index1 = 'room_created' AND ${since} GROUP BY day, lang ORDER BY day`,
  // Songs the player could not play: candidates to drop from the catalog.
  unplayable: `SELECT blob2 AS videoId, blob3 AS channel, SUM(_sample_interval) AS times FROM ${T} WHERE index1 = 'song_unplayable' AND ${since} GROUP BY videoId, channel ORDER BY times DESC LIMIT 30`,
  // What people searched for when the catalog came up short: candidates to add.
  misses: `SELECT blob2 AS query, SUM(_sample_interval) AS times, AVG(double2) AS avg_results FROM ${T} WHERE index1 = 'search_fallback' AND ${since} GROUP BY query ORDER BY times DESC LIMIT 40`,
  // Actions the room refused and real bugs, by code.
  errors: `SELECT index1 AS event, blob2 AS code, blob3 AS msg, SUM(_sample_interval) AS times FROM ${T} WHERE index1 IN ('room_error', 'handler_failed') AND ${since} GROUP BY event, code, msg ORDER BY times DESC LIMIT 30`,
  // Crashes in the app on people's devices.
  client: `SELECT blob3 AS screen, blob4 AS message, SUM(_sample_interval) AS times FROM ${T} WHERE index1 = 'client_error' AND ${since} GROUP BY screen, message ORDER BY times DESC LIMIT 30`,
  // How parties end, and how long the nights are (songs sung, people).
  endings: `SELECT blob2 AS reason, SUM(_sample_interval) AS parties, AVG(double1) AS avg_songs_played, AVG(double2) AS avg_skipped, AVG(double3) AS avg_people FROM ${T} WHERE index1 = 'room_ended' AND ${since} GROUP BY reason ORDER BY parties DESC`,
};

const sql = PRESETS[what] ?? what;
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: sql,
});
const body = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  process.exit(1);
}
const { data = [] } = JSON.parse(body);
if (data.length === 0) console.log("(no rows)");
else console.table(data);
