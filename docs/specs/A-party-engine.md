# Spec A: Party engine

You build everything that makes a party work behind the screens: creating rooms, joining, the live queue,
YouTube search, and playing the queue on the host's YouTube window. You don't build the Spotify-style screens; Spec B does.
Read `docs/specs/README.md` first, then `packages/shared/src/protocol.ts`, which is your contract.

## You own

- `apps/api/**`: Hono Worker, `Room` Durable Object, KV/D1 bindings in `wrangler.jsonc`
- `packages/client/**` (new): the real `RoomClient` and `SearchApi` for the browser
- `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/youtube.content/**`,
  `apps/extension/utils/**`, `apps/extension/wxt.config.ts`
- `packages/shared/src/protocol.ts`: you may add to it, following the README rules

## Don't touch

`apps/web/**`, `packages/ui/**`, `apps/extension/entrypoints/host/**`, `apps/extension/entrypoints/popup/**`.

## Tasks (in order)

### A1. Room engine (Durable Object) ✅
Rewrite `apps/api/src/durable-objects/room.ts` to implement the contract.
- Store state in the DO's SQLite storage (`ctx.storage.sql`) so it survives hibernation. Keep the WebSocket Hibernation API.
  Tag each socket with its member id (`ctx.acceptWebSocket(ws, [memberId])` or `serializeAttachment`).
- `join` creates a member with role `guest`. Duplicate nicknames get a number ("Ana 2"). Reply `welcome` with a random
  `key`; store only its SHA-256 hash. `rejoin` checks the hash. Refuse `join` when locked (`room_locked`) or ended (`room_ended`).
- Permissions as commented in `ClientMessage`. Reply `error` with `not_allowed` and change nothing when a check fails.
- Queue order for `upNext`:
  - `rotation`: one song per singer per round. A singer's round = how many songs they have sung or started. Order by
    (round, the time the singer joined the rotation). The host's manual `move_song` overrides this until the song is played.
  - `fifo`: by `addedAt`.
  - `maxWaitingPerMember` applies to guests (`queue_limit`). Hosts are exempt.
- After every change, broadcast `state` to everyone. `members[].connected` follows socket open/close.
- Reactions: when `settings.reactions` is on, broadcast `reaction`. Limit each member to 1 every 500 ms. Don't store them yet.
- `end_party`: status `ended`, broadcast `ended`, set an alarm that deletes storage 1 hour later.
- Room creation: `POST /api/rooms` picks a 4-character code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` that's not in use,
  initialises the DO with the host member, and returns `CreateRoomResponse`. `GET /api/rooms/:code` returns `RoomInfoResponse`.

**Done when:** tests (see A5) cover join, rejoin, permissions, rotation order, queue limit and lock.

### A2. Playback state machine (in the room) ✅
- When nothing is playing and `upNext` gets a song, or when the current song ends or is skipped:
  - with `getReadyCard` on: playback `get_ready`, `countdownEndsAt = now + countdownSec`, alarm at that time, then send `play`;
  - otherwise send `play` right away.
- `nowPlaying` moves to `playing` when the player sends `player_event: started`. `progress` (every ~5 s) updates `positionSec`.
  `ended` marks it `played`; `error` marks it `skipped` and moves on.
- `pause` / `resume` / `restart` from hosts → update playback and send `player_command` to the player socket.
- Only the host's extension socket counts as the player. Mark it by sending `?player=1` on the WebSocket URL with the host key.

### A3. Search ✅
- `GET /api/search?q=` calls YouTube Data API v3 `search.list` (type=video, videoEmbeddable=true, q = `<q> karaoke`, 15 results),
  then `videos.list` for durations. Return `SearchResponse`.
- Cache in KV by normalised query (lowercase, trimmed, collapsed spaces) for 7 days. Add a `SEARCH_CACHE` KV binding.
- `GET /api/videos/:id` uses `videos.list`, caches for 30 days. Accept a full YouTube URL too (parse `v=`, `youtu.be/`, `shorts/`).
- API key in the secret `YOUTUBE_API_KEY` (`.dev.vars` locally, `wrangler secret put` in prod). Document it in the README.
- When the YouTube quota runs out, return 503 with a clear message. The UI shows "Search is resting, paste a link instead".
- Skip D1 for now; cached songs live in KV.

### A4. Browser client (`packages/client`) ✅
New workspace package `@karaoke-tube/client`:
- `createRoomClient({ code, baseUrl, identity? })` implements `RoomClient` over WebSocket. Keeps `memberId` + `key` in
  `localStorage` under `kt:room:<CODE>` and rejoins automatically. Reconnects with backoff (1 s, 2 s, 4 s, max 10 s), status `reconnecting` meanwhile.
- `createSearchApi(baseUrl)` implements `SearchApi`.
- No React in this package. Spec B adds the React hooks.

### A5. Tests ✅
Use `@cloudflare/vitest-pool-workers` for the API. (Renamed upstream to `@cloudflare/vitest-plugin`, which is what's installed.
Tests are in `apps/api/test/`: `queue`, `room`, `playback`, `search`.) Put the queue-ordering logic in a pure function (`apps/api/src/queue.ts`)
and test it directly as well. `pnpm --filter @karaoke-tube/api test` passes.

### A6. Extension: party session + YouTube player
- Background:
  - On message `{ type: "START_PARTY", nickname, avatarSeed }`: call `POST /api/rooms`, save `{ code, memberId, key }` in
    `chrome.storage.session`, open the host app page (`host.html`), and open a separate YouTube window (`https://www.youtube.com/`)
    to drag onto the TV. Reply `{ ok: true, code }`.
  - Hold the host's WebSocket (with `?player=1`). Keep the service worker alive while a party runs (the content script's port keeps it awake; ping every 20 s).
  - Expose the room to extension pages through a `chrome.runtime` port named `room`. Write `apps/extension/utils/room-client.ts`
    exporting `createExtensionRoomClient(): RoomClient`, which talks to that port. Spec B's host page imports this.
  - `END_PARTY` / `GET_PARTY` messages for the popup.
- Content script on the party's YouTube window only (match by the tab id saved in the background):
  - On `play`: navigate to `/watch?v=<id>`. Report `started` when the `<video>` element plays, `progress` every 5 s, `ended` on the `ended` event,
    `error` if nothing plays within 15 s or YouTube shows an error.
  - Stop YouTube's own autoplay from taking over (cancel the "up next" autoplay, or react to `ended` before it starts).
  - Apply `player_command` to the `<video>` element.
  - Mount the TV overlay inside the player element (`#movie_player`) so it stays visible in fullscreen. For now, mount the
    existing `Badge` there with "now singing" and "up next" text. Spec B delivers the real overlay components later.
- Remove the old `RoomMessage` echo types from `packages/shared/src/index.ts` once nothing uses them.

**Done when:** start a party from a test popup button or the background console, add a song with a test WebSocket client,
and the YouTube window plays it, then plays the next one on its own.

## Out of scope
Titles, recaps, duets UI, turn alerts, rating, D1, avatar rendering, all visual design.

## Requests for the other track
- (none yet)
