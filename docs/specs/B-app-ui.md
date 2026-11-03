# Spec B: App UI

You build every screen people see: the guest phone app, the host app on the laptop, the extension popup, and the TV overlay
components. The look copies Spotify's layout and behaviour as closely as possible, with our own branding. Spec A builds the
rooms, search and playback at the same time. You work against a mock of its client, so you never wait for it.
Read `docs/specs/README.md` first, then `packages/shared/src/protocol.ts`, which is your contract.

Wireframes: the "Screens" section of the plan page, https://claude.ai/artifact/PXZvPMNQE63GCzZyDDukjW (H1–H2, G1–G7, T1–T3).

## You own

- `packages/ui/**` (new): design tokens, components, screens, the mock client, React hooks
- `apps/web/**`: the guest phone app
- `apps/extension/entrypoints/host/**` (new): the host app page
- `apps/extension/entrypoints/popup/**`

## Don't touch

`apps/api/**`, `packages/client/**`, the extension's `background.ts`, `youtube.content/**` and `utils/**`.

## Look and feel

Copy from Spotify: the dark interface, black frame with rounded panels (desktop), left sidebar, main area, right Queue panel, bottom
player bar, Home with greeting, chips, 6 shortcut tiles and rows of cards, Search with "Browse all" colour tiles, phone bottom tabs
with a mini player above them, full-screen "now playing", story-style recap. Match spacing, sizes, hover states and transitions closely.

Never use Spotify's: name, logo, green (#1DB954 / #1ED760), the Circular font, or their icons. Instead use:
- Name **Karaoke Tube**, a mic in a circle as the mark (placeholder).
- Accent pink `#ff4f8b` on dark ink `#1f0711`. Base `#070609`, panels `#131016`, cards `#221d27`, hover `#2c2632`, secondary text `#b0a8b8`.
- Font: Figtree (via `@fontsource/figtree`, so it works inside the extension without Google Fonts).
- Icons: `lucide-react`.
- Avatars: DiceBear (`@dicebear/core` + one style) from `member.avatarSeed`.

Put every colour, radius, spacing step and font size in `packages/ui/src/tokens.css` as CSS variables. Use CSS Modules or plain CSS with
those variables; no CSS-in-JS runtime. Respect `prefers-reduced-motion`.

## Tasks (in order)

### B1. `packages/ui` foundation
- New workspace package `@karaoke-tube/ui` (React 19, TypeScript, exports from `src/index.ts`, consumed as source like `shared`).
- `tokens.css`, base reset, Figtree.
- Hooks: `RoomProvider` (takes a `RoomClient`), `useRoom()` (state, me, status, send), `useReactions()`, `useSearch()` (takes a `SearchApi`).
  Build them on `useSyncExternalStore` over `RoomClient.subscribe`.
- `createMockRoomClient(options)` and `createMockSearchApi()` with believable sample data: 8 members, a song playing with progress moving,
  5 songs up next, about 30 karaoke songs for search. The mock applies messages locally (add/remove/move/skip/settings/react), so the UI behaves for real.
  Add a "simulate" helper that sends a random reaction every few seconds and finishes the current song early, for testing.
- Components: `Avatar`, `Pill`/`Chip`, `Tile`, `Card`, `SongRow`, `QueueRow`, `ProgressBar`, `PlayerBar`, `MiniPlayer`, `BottomTabs`, `Toggle`, `Toast`, `Sheet` (bottom sheet), `EmptyState`.

### B2. Guest phone app (`apps/web`)
- React Router with routes `/join/:code?`, `/r/:code` (Home), `/r/:code/search`, `/r/:code/queue`, `/r/:code/party`, plus the full-screen now-singing sheet.
- Screens G1–G6 from the plan:
  - **Join (G1)**: code (filled from the URL), avatar with re-roll, nickname, Join. Errors for unknown, locked or ended rooms.
  - **Home (G2)**: greeting with nickname, genre chips, 6 shortcut tiles, "Popular in this room" row (from songs played and queued).
  - **Search (G3/G4)**: search field, "Browse all" tiles (each runs a preset query, defined in `packages/ui/src/browse.ts`), results with ⊕ add,
    toast "Added to queue · you're 3rd", paste-a-link via a chip. Show the queue-limit error nicely.
  - **Queue (G5)**: now singing, "You're up in N songs" banner, next up with singer avatars, ✕ on your own songs, ⋯ menu for co-hosts.
  - **Now singing (G6)**: big artwork from the thumbnail, progress, five reaction buttons; pause/skip for co-hosts.
  - **Party tab**: room code, guests list, leave.
  - Mini player above the tabs on every screen, opens the now-singing sheet.
- States: connecting, reconnecting banner, kicked, party ended (simple "Thanks for singing" screen for now).
- Choose the client by env: `VITE_USE_MOCK=1` uses the mock; otherwise `@karaoke-tube/client` (see Integration).

### B3. Host app (`apps/extension/entrypoints/host/`)
- A WXT unlisted page `host.html`, full-tab desktop layout H1: sidebar (mark, Home, Search, "Your party" with code, QR from `qrcode`, guests),
  main area (Home / Search / Settings views), right Queue panel with drag to reorder (`@dnd-kit/sortable`), bottom player bar
  (restart, pause/resume, skip, progress, reaction count, lock, "Show on TV", End party with an in-page confirm).
- Guest menu: make co-host, remove.
- **Settings (H2)**: every `RoomSettings` field, live.
- Uses the mock until A's `createExtensionRoomClient()` exists at `apps/extension/utils/room-client.ts`.

### B4. Popup (`apps/extension/entrypoints/popup/`)
Small Spotify-style card. No party: nickname + avatar + "Start a party" (sends `{ type: "START_PARTY", nickname, avatarSeed }` to the background).
Party running: code, guest count, "Open host app", "End party" (`END_PARTY`), and `GET_PARTY` on open.

### B5. TV overlay components
Presentational only, props in and nothing else, exported from `packages/ui/src/tv/`:
`TvOverlay` (T1: now-singing chip, up-next chip, QR + code, floating reactions), `GetReadyCard` (T2: avatar, name, song, countdown from `countdownEndsAt`).
They must render inside a shadow root: no global CSS and no `document`-level styles, and the CSS must be importable as a string.
Spec A mounts them in the content script. Build a `/dev/tv` route in `apps/web` to preview them over a fake video background.

## Integration (last step, after Spec A's branch is merged)
- `apps/web`: replace the mock with `createRoomClient` / `createSearchApi` from `@karaoke-tube/client`.
- Host page: use `createExtensionRoomClient()`.
- Check the full flow with two phones (two browser windows) and the extension.

## Out of scope
Titles and awards screens (G7, T3), duets UI, turn alerts, rating, avatar builder, light theme, i18n.

**Done when:** with `VITE_USE_MOCK=1`, every screen above works at 375 px and 1280 px wide, `pnpm typecheck` and `pnpm build` pass,
and nothing in the UI uses Spotify's name, logo, green or font.

## Requests for the other track
- (none yet)
