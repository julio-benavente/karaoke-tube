# Karaoke Tube 🎤

Karaoke parties with friends, powered by YouTube karaoke videos.

```
apps/
  api/        Hono on Cloudflare Workers + Durable Objects (one per room). Also serves apps/web in prod.
  web/        Guest web app (React + Vite) – join a room from your phone
  extension/  Chrome extension (WXT + React) – runs on the host's YouTube tab
packages/
  shared/     Types shared by all apps
```

## Setup

```sh
corepack enable pnpm   # once
pnpm install
```

### YouTube API key

Search (`/api/search`, `/api/videos/:id`) calls the YouTube Data API v3. Make a key in Google Cloud Console
(APIs & Services → enable "YouTube Data API v3" → Credentials → API key), then:

```sh
cp apps/api/.dev.vars.example apps/api/.dev.vars   # local: put the key in YOUTUBE_API_KEY=
cd apps/api && npx wrangler secret put YOUTUBE_API_KEY   # production
```

Without a key, or when the daily quota (10,000 units, about 100 searches) runs out, search returns
`503 { error: "search_unavailable" }` and the UI asks for a pasted link. Results are cached in the `SEARCH_CACHE` KV
namespace (searches 7 days, videos 30 days), so repeat searches are free.

## Dev

```sh
pnpm dev               # runs api (:8787), web (:5173) and the extension together
# or one at a time:
pnpm dev:api
pnpm dev:web
pnpm dev:extension     # opens a Chrome window with the extension loaded
```

### Smoke test
- **API:** http://localhost:8787/api/health
- **Web:** http://localhost:5173. Shows API health and connects to room `TEST`. Open two tabs and click "Send ping to room" to see the broadcast.
- **Extension:** open any YouTube video in the Chrome window WXT launched, then check the page console for `[content]` logs. Background logs are under `chrome://extensions` → Karaoke Tube → "service worker". The popup has a "Ping API" button.

## Other commands

```sh
pnpm typecheck
pnpm build
pnpm --filter @karaoke-tube/api test         # room, queue, playback and search tests (Workers runtime)
pnpm --filter @karaoke-tube/api cf-typegen   # after editing wrangler.jsonc
pnpm --filter @karaoke-tube/api deploy       # builds web + deploys the Worker (needs `wrangler login`)
pnpm --filter @karaoke-tube/extension zip    # zip for the Chrome Web Store
```
