# Operations: backups, monitoring, YouTube rules

## Backups (D1: accounts, favorites, friends, party log)

D1 keeps point-in-time history ("Time Travel") automatically, 30 days on the Workers Paid plan (7 on Free). Nothing to turn on.

```sh
cd apps/api
pnpm wrangler d1 time-travel info DB                      # shows the current bookmark
pnpm wrangler d1 time-travel restore DB --timestamp=2026-11-03T12:00:00Z   # roll back to a moment
pnpm wrangler d1 export DB --remote --output=backup-$(date +%F).sql          # a file copy, keep it off this machine
```

Run the export before risky changes (schema edits, big deploys). Room state lives in Durable Objects and recaps in KV; both are temporary by design and are not backed up.

## Monitoring

- `observability` is enabled in `apps/api/wrangler.jsonc`: Workers Logs keep `console.log` / `console.error` (for example `[room] handler failed`). Read them in the Cloudflare dashboard → Workers → karaoke-tube → Logs, or live with `pnpm wrangler tail`.
- The server prints one JSON line per key event (`apps/api/src/log.ts`), so logs can be filtered and counted by field in the dashboard: `room_created` (lang, signedIn), `member_joined`, `song_added` (status, duet, byHost, explicit, videoId), `song_ended`, `song_unplayable` (videoId, channel), `room_ended` (reason: host / host_left / abandoned, songsPlayed, songsSkipped, members), `room_error` (code, msg: a client did something the room refused) and `handler_failed` (a real bug). `room` is a short id that ties one party's lines together. Nothing personal is logged: no nicknames, emails, join codes or keys.
- Add an alert in the dashboard (Notifications → Workers: "high error rate") so someone is told when requests start failing. This is account setup, not code.
- Front-end errors are not collected. If you want them, add Sentry (or similar) to `apps/web`; it needs an account and a DSN, so it is not in the code yet.

## YouTube rules to keep

- Playback is YouTube's own embedded player; we never download or re-host video.
- Keep the player visible and unobscured. TV layout "Bar" (the default) puts the singer, queue and join code under the video. "Full screen" draws them over the video, which is the part to review against YouTube's embedded-player policies before a public launch.
- Search uses the YouTube Data API; its quota is the reason for the local song catalog and the 7-day cache.
- Songs that can't be embedded are skipped, and the singer and hosts are told (`song_unplayable`).
