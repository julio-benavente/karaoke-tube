# Karaoke Tube 🎤

Karaoke parties with friends, powered by YouTube karaoke videos.

```
apps/
  api/        Hono on Cloudflare Workers + Durable Objects (one per room). Also serves apps/web in prod.
  web/        Web app (React + Vite): guest phone screens, the host app (/host) and the TV screen (/tv)
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
pnpm dev               # runs api (:8787) and web (:5173); the website runs the whole party
# or one at a time:
pnpm dev:api
pnpm dev:web
```

### Smoke test
- **API:** http://localhost:8787/api/health
- **Web:** http://localhost:5173. Shows API health and connects to room `TEST`. Open two tabs and click "Send ping to room" to see the broadcast.
- **Party:** open http://localhost:5173/host/new, start a party, then click "Open TV screen" (opens `/tv/<code>`; drag it to the TV and press "Start the party on this screen"). Guests join at `/join/<code>`. The TV screen plays the queue with the YouTube IFrame API.

## Other commands

```sh
pnpm typecheck
pnpm build
pnpm --filter @karaoke-tube/api test         # room, queue, playback and search tests (Workers runtime)
pnpm --filter @karaoke-tube/api cf-typegen   # after editing wrangler.jsonc
pnpm --filter @karaoke-tube/api deploy       # builds web + deploys the Worker (needs `wrangler login`)
```
