# Specs: two parallel tracks

Goal: the MVP from the plan (milestones M1–M4 plus emoji reactions), built by two agents at the same time.

Plan page (features, wireframes, decisions): https://claude.ai/artifact/PXZvPMNQE63GCzZyDDukjW

| Spec | Track | Owns | Branch |
|---|---|---|---|
| [A-party-engine.md](A-party-engine.md) | Rooms, queue, search, YouTube playback | `apps/api`, `packages/client`, extension background + content script | `feat/party-engine` |
| [B-app-ui.md](B-app-ui.md) | Spotify-style screens for phone, host app and TV | `packages/ui`, `apps/web`, extension `host` + `popup` pages | `feat/app-ui` |

## The contract

`packages/shared/src/protocol.ts` defines everything the two tracks share: domain types, WebSocket messages,
HTTP responses, and the `RoomClient` / `SearchApi` interfaces.

- **B** builds the UI against a **mock** `RoomClient` and `SearchApi`.
- **A** builds the **real** ones.
- Integration = swap the mock for the real client (see "Integration" in B).

Rules for changing the contract:
1. Only add things (new optional fields, new message types). Don't rename or remove.
2. Make the change in its own small commit, `contract: <what>`, so the other branch can cherry-pick it.
3. Write the change in the "Contract changes" list at the bottom of this file.

## Working rules for both agents

- Stay inside the folders your spec owns. If you need something in the other track's folders, write it under
  "Requests for the other track" at the bottom of your spec instead of editing it.
- Root files (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) can be touched by both. Add a dependency in its own
  commit so the lockfile conflict is easy to resolve.
- React for all UI. TypeScript strict. No new frameworks without noting it in your spec.
- Before saying a task is done: `pnpm typecheck` and `pnpm build` pass.
- Commit in small steps on your branch. Don't merge into `main`; the user does that.

## How to start the two agents

Commit the current work first, then make one worktree per track:

```sh
git worktree add ../karaoke-tube-engine -b feat/party-engine
git worktree add ../karaoke-tube-ui -b feat/app-ui
```

Then in each folder run `pnpm install` and `claude`, and type:

```
/goal docs/specs/A-party-engine.md      # in ../karaoke-tube-engine
/goal docs/specs/B-app-ui.md            # in ../karaoke-tube-ui
```

`/goal` (`.claude/commands/goal.md`) also takes a claude.ai artifact link. It picks up from the first task not marked ✅,
so you can run the same line again in a new session to continue.

Ports, so both can run dev servers at the same time: the engine worktree uses the defaults (API :8787, web :5173).
The UI worktree runs only the web app on :5174 with the mock (`pnpm --filter @karaoke-tube/web dev --port 5174`) and doesn't need the API.

## Contract changes

- `ApiErrorCode` / `ApiErrorResponse` (A3): the JSON body of every non-2xx `/api` response. A 503 with
  `search_unavailable` means YouTube search is out of quota; the real `SearchApi` rejects with an `ApiError` carrying it.
- `RoomClient.closeReason?: "kicked" | "ended" | "left" | null` (B, `contract: RoomClient.closeReason`). The UI needs to
  tell "you were removed" apart from "party ended" and a dropped connection. A's clients should set it when the server
  sends `kicked` / `ended`, or when `close()` is called.
- `player_event.durationSec?` (integration): the player reports the video's real length. Songs added from a pasted link
  without a YouTube key come from oEmbed with `durationSec: 0`; the room fills it in from this when the song starts.
- Room codes (integration): `ROOM_CODE_EXAMPLE`, `ROOM_CODE_RE`, `normalizeRoomCode()`, `isRoomCode()`. Codes are
  three words, e.g. `fuzzy-golden-panda` (was 4 characters), lowercase with dashes; the API also rate-limits room
  lookups and joins per IP. (`ROOM_CODE_ALPHABET` / `ROOM_CODE_LENGTH` from an intermediate commit are gone.)
