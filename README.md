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
pnpm --filter @karaoke-tube/api cf-typegen   # after editing wrangler.jsonc
pnpm --filter @karaoke-tube/api deploy       # builds web + deploys the Worker (needs `wrangler login`)
pnpm --filter @karaoke-tube/extension zip    # zip for the Chrome Web Store
```
