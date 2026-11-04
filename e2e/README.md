# End-to-end scenarios

The scenarios are listed in `../docs/e2e-scenarios.md` (S01–S40). All 40 are built (`scenarios/`, one file each; a few
have a "b"/"c" companion for an edge case).

```sh
pnpm e2e                 # all built scenarios, 3 at a time
pnpm e2e s03             # one (match on file name)
pnpm e2e -g "@countdown" # a group, by tag
pnpm e2e --headed        # watch the browsers
pnpm e2e --repeat-each=3 # run each 3 times (to look for flakiness)
E2E_SEED=1234 pnpm e2e s40   # replay the random night (S40) that failed with seed 1234 (the seed is in its name)
E2E_ACTIONS=150 pnpm e2e s40 # a longer random night
E2E_WORKERS=2 pnpm e2e       # fewer at a time, if the machine is struggling
```

It starts its own API (port 8788, short timers, throw-away data in `apps/api/.wrangler/e2e`) and web server (port 5174),
so your normal `pnpm dev` (8787 / 5173) is left alone. If those two are already running it reuses them.
It drives your installed Google Chrome (Playwright's own download doesn't support this Mac's macOS).

After a failure: `e2e/test-results/<scenario>/` has screenshots and a trace (`npx playwright show-trace <trace.zip>`).

## How a scenario is written

```ts
test("S0x · …", async ({ night }) => {
  await night.startParty("Hana");     // real /host/new flow
  const tv = await night.openTv();    // /tv/<code> + "Start party", with a fake YouTube
  const ana = await night.join("Ana"); // real join flow, on a phone-sized browser
  await ana.addSong("bohemian");      // by message; ana.addViaSearch(...) types in the real search
  await night.host.waitForState("get ready", (s) => s.playback.state === "get_ready");
});
```

- `lib/people.ts`: Host, Phone and Tv (each its own browser context). Read the room state a screen sees, the countdown
  numbers it shows, send messages, read the errors the room sent.
- `lib/night.ts`: `night.setup({ tv, countdown, songSec, guests, settings, lang })` is the usual start. With `tv: false` the
  first song stays in "get ready", which keeps queue orders still for ordering tests. `night.join`, `night.tryJoin`,
  `night.openTv`, `night.adopt(person)` for screens a scenario makes by hand.
- `lib/people.ts` also has `goOffline()` / `comeBack()` (a closed tab) and `setNetwork(false|true)` (cuts the room
  connection; Chrome keeps WebSockets open when told to go "offline", so this is done at the socket).
- `lib/fakeYT.ts`: stands in for YouTube. `tv.fake({ defaultDuration, failing, stuck })` changes how it behaves.
- `lib/checks.ts`: the **watcher**. It runs beside every scenario and records any break of these rules, then the
  scenario fails at the end with the list:
  - **C1** every screen shows the same queue, singer and roles (given 2.5 s to catch up)
  - **C2** every countdown on every screen matches the room's (±1 s), never goes up, shows up when it should, and is
    gone when the room stops being in "get ready"; "get ready" never outlasts its countdown by more than 4 s (turn
    that one off with `night.watcher.allow("stuck")` when a scenario is testing a TV that isn't there)
  - **C3** one song playing at most; idle exactly when nothing plays; no song twice in the queue
  - **C6** no console errors, exceptions or 5xx answers; no raw translation keys, "undefined" or "NaN" on screen
  - **C8** a song's position only moves forward (a restart is the one way back: `night.watcher.allow("C8")` around it)
  - C4 (rotation order) and C5 (permissions) are asserted inside the scenarios that test them (S06–S08, S12, S16, S20,
    with `expectRefused`); C7 (refresh-proof) is `person.reloadAndSettle()`, used in S35 and S40.
- Test hooks in the app (inert unless a test sets `window.__KT_E2E`): `createRoomClient` registers its client on
  `window.__ktClients`; countdown numbers carry a `data-countdown` attribute; `E2E_FAST=1` on the API shortens the
  host-offline (60 → 3 s) and award (60 → 6 s) timers.
