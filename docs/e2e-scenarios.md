# End-to-end scenarios

40 whole-app "nights", written to be run on demand in development (not on every commit). Each one drives the real
screens (host app, several phones, the TV page) against a local API, the way people use the app, and mixes many
features so that interactions show up, not just single features.

The existing `apps/api/test/*.test.ts` files check the room's rules one message at a time. These scenarios check
what a person sees when many things happen together (for example, that the countdown is right on all four screens).

## How they would run

| | |
|---|---|
| Command | `pnpm e2e` (all), `pnpm e2e s03` (one), `pnpm e2e -g "@tv"` (a group). It starts its own API and web server on other ports, so `pnpm dev` is untouched. See `e2e/README.md`. |
| Driver | Playwright. One browser context per person: **Host** (desktop), **phones** (mobile viewport, own storage), **TV** (`/tv/<code>` or paired). Each scenario creates its own party, so scenarios can run in parallel (about 4 at a time: ~5 min for all 40). |
| Fake YouTube | The TV page uses `window.YT` if it already exists, so the tests inject a fake player that "plays" a clock and can be told to end, fail or report a length. No real video, no network, songs last 4–8 s. |
| Fast timers | Dev-only override (`E2E_FAST=1`, which `pnpm e2e` sets on its own API only) for the timers that are minutes long: host-offline stand-in (60 s → 3 s), award window (60 s → 6 s), TV code renewal (5 min → 8 s). Without it, scenarios S15, S19, S25, S30 take minutes. |
| Songs | Songs come from the local catalog by title, so the scenarios don't depend on YouTube search. |
| People | Hana = host, Ana, Ben, Cleo, Dev, Eli, Fay = guests, Gran = a guest with no phone. |

## Checks that run after every step of every scenario

C1, C2, C3, C6 and C8 run all the time in the watcher. C4, C5 and C7 are asserted inside the scenarios that are about them.

These are what catch bugs like "the counter isn't working", because they run all the time, not only where a
scenario thinks to look.

- **C1 Same truth everywhere.** Host, every phone and the TV show the same now-singing song and the same queue order.
- **C2 Countdown is sane.** Whenever the room is in `get_ready`, every surface that shows a number (TV card, singer's phone, other phones' mini player, host player bar) shows the same number within 1 s of `countdownEndsAt − now`; it starts at no more than `countdownSec`, never goes up, never shows a stale number when it starts, and `get_ready` doesn't last longer than `countdownSec + 3 s` (the TV must report `started` by then, or the song is skipped as unplayable).
- **C3 One thing playing.** At most one `nowPlaying`; `idle` exactly when there is none; a song is never played twice.
- **C4 Rotation rule.** In rotation mode no one sings a second song while someone else has a first song waiting (unless the host moved it by hand).
- **C5 Permissions.** A guest never sees host controls, and any host-only message from a guest gets `not_allowed` and changes nothing.
- **C6 No debris.** No console errors, uncaught exceptions or failed requests (except ones a scenario expects), no raw translation keys on screen (`queue.nowSinging`), no "undefined"/"NaN"/"[object Object]".
- **C7 Refresh-proof.** Reloading any surface at any moment brings it back to the same screen with the same state within 3 s.
- **C8 Time moves forward.** Song position only increases (except restart); progress bars never exceed the song length.

## Twists

Each scenario is also given a few "twists" so the combinations vary: `lang` en/es · `tv` bar-small / bar-medium / bar-large / clean ·
`mode` rotation / fifo / approval · `count` countdown 0 / 1 / 3 / 10 s · `join` between / always / start · `view` phone sizes (small 360 px, large 430 px, tablet).

---

## A. Basics: the countdown and one singer

**S01 · Solo night** `@core` · twist: mode rotation, count 3, tv bar-medium
Hana creates a party, pairs the TV, adds one song, sings it, ends the party.
1. Host creates the party; TV opens `/tv/<code>`, presses Start. Lobby shows the QR and code.
2. Hana adds "Bohemian Rhapsody". TV flips to the get-ready card: 3 → 2 → 1; host bar and Hana's phone view agree (C2).
3. The fake player reports `started`; state `playing`; the TV shows the bar with the title and singer.
4. Song ends; playback `idle`; TV goes back to the lobby; queue empty everywhere.
5. Hana ends the party. TV shows "party ended"; the recap page opens with Hana's performance and the titles she got.

**S02 · Countdown on every screen** `@core @countdown` · twist: count 10 then 1, view small + tablet
Hana, Ana and Ben are in the room with the TV on. Ana adds a song.
1. Check C2 on all four surfaces, every 250 ms, for the whole countdown.
2. While it counts, Hana changes the countdown length to 2 s. The running one keeps its own end time; the next song uses 2 s.
3. Ben reloads his phone during the countdown: his mini player shows the right number at once, not a flash of a wrong one.
4. Hana sets the countdown to 0: the next song goes straight to play (no get-ready card at all).
5. Hana turns the get-ready card off, then on again.

**S03 · The TV isn't ready yet** `@core @countdown @tv` · twist: count 3, join start
The first song is added before anyone opened the TV page.
1. Ana adds a song with no TV connected. The room starts `get_ready` anyway; check what every phone shows for the full 3 s and after it.
2. The countdown reaches 0 with no TV. Expect: a clear "waiting for the TV" message, not a counter frozen on 0 (this is the suspected bug: the room stays in `get_ready` until the TV reports `started`).
3. TV page opens but nobody presses Start (autoplay needs a click). Same check.
4. Someone presses Start: the song begins from the beginning, phones leave `get_ready`.
5. Ana adds a second song while the first plays; it waits, and its countdown starts only after the first ends.

**S04 · Host controls during a countdown** `@core @countdown` · twist: count 10, mode fifo
1. Ana's song enters `get_ready`. Hana presses pause and restart: nothing changes (the countdown keeps going).
2. Hana presses skip during the countdown. Ana's song is skipped; Ben's next song gets a full new countdown, not the remainder of the old one.
3. Hana tries to remove the song that is in its countdown: refused (`not_allowed`), nothing changes. Skip is the way.
4. Skip with nobody waiting: playback goes `idle`, the TV has no countdown left.
5. Cleo adds a song right after: a fresh countdown starts. C2 holds in each step.

**S05 · Pause, resume, restart** `@core` · twist: tv clean, view large
1. Song playing at ~3 s in. Hana pauses: TV and phones show "paused", position freezes (C8).
2. Wait 3 s, resume: playback continues from the same position, not from 0 and not 3 s later.
3. Hana restarts: position goes to 0 on all surfaces; the song is not counted twice.
4. Pause, then refresh the TV: the TV comes back paused at the same position. Resume continues.
5. Pause, then skip: next song gets its countdown (a paused song doesn't block the queue).

## B. Friends singing together

**S06 · Two friends, fair rotation** `@queue` · twist: mode rotation, lang es
Ana and Ben join in Spanish. Ana adds three songs, Ben adds one.
1. Ana's third song is refused (limit 2): she sees the limit message, nothing is added, others see no change.
2. Expected order: Ana 1, Ben 1, Ana 2. Ben adds a second song: Ana 1, Ben 1, Ana 2, Ben 2.
3. When Ana's first song starts, her freed slot lets her add the third; it goes to the end of round 3.
4. Hana (host, exempt from the limit) adds four songs in a row without error.

**S07 · Friday five** `@queue @join` · twist: view small, join always
1. Ana, Ben, Cleo, Dev and a second "Ana" join within 10 s. The second is called "Ana 2" everywhere.
2. Everyone adds one song at the same moment (parallel). No song is lost or duplicated; order follows join order for round 1.
3. Eli joins while Cleo is singing and adds a song: it goes into the current round, not after everyone's second round.
4. TV "always" shows the join QR over the song; "start" shows it only in the lobby: switch live and check.
5. Everyone's phone shows the same queue (C1) after each change.

**S08 · Switch queue mode mid-night** `@queue` · twist: mode rotation → fifo → rotation
1. Ana queues three songs (limit raised to 3), Ben one. Rotation order: A B A A.
2. Hana switches to first-come-first-served: order becomes A A A B. Phones update without refresh.
3. Hana drags Ben's song to the top, then switches back to rotation: the dragged song stays where she put it until it plays.
4. "Play next" on Ana's second song: it jumps to the top; the rest keep their order.

**S09 · Host picks (approval)** `@queue @host` · twist: mode approval, tv bar-large
1. Hana switches to "Host picks". Ana and Ben add songs: they appear as waiting for OK on their phones and as "Needs your OK" for Hana, and don't play.
2. Hana approves Ben's song: it starts (get-ready, play). Ana's still waits.
3. Hana declines Ana's: Ana's phone drops it. Ana adds another; Hana approves it.
4. Hana switches to rotation while one song is pending: the pending song joins the queue (or stays pending, whichever the app defines) and no one is stuck.
5. Songs the host adds herself skip approval.

**S10 · Duet night** `@songs` · twist: tv bar-small, lang en
1. Ana adds a duet with Ben. Both phones show it as theirs; the TV card says "Ana & Ben".
2. When it is their turn, both get a turn alert (`turnAlerts` on); the countdown shows on both phones.
3. Duet in rotation counts as a song for both of them: Ben's next solo goes after everyone else's first.
4. Cleo adds a duet with Dev, and Dev leaves before it plays: the song stays for Cleo, alone.
5. Turn alerts off: no alert; duets off: the duet picker disappears for guests.
6. After the party the recap has "Duet Partner" for Ana/Ben.

**S11 · Everyone sings** `@songs` · twist: view tablet, count 3
1. Cleo adds a group song for everyone. The TV shows "Everyone". All 5 phones get the turn alert and show the countdown.
2. During the song, a late guest (Fay) joins: she appears in the room and sees the group song playing.
3. After it, a normal song plays; the group song doesn't count against anyone's slot limit.
4. Recap gives Cleo "Choir Leader".

**S12 · Only hosts add** `@host` · twist: mode rotation
1. Hana turns on "only hosts can add". Ana's search shows "Only the hosts can add songs right now"; the add buttons are disabled.
2. Ana tries anyway (by sending the message): `not_allowed`.
3. Hana adds a song "sing as Ana" and one as Ben: they take turns as Ana and Ben.
4. Hana turns the setting off live: Ana's search works without a refresh.

**S13 · Queue limit changes live** `@queue` · twist: view small
1. Limit is 2. Ana has 2 waiting. Hana raises it to 4: Ana's search, which showed the limit message, unlocks immediately.
2. Ana adds two more. Hana lowers it to 1: Ana keeps what she has, can't add, and can still remove songs.
3. Ana's first song plays (it leaves her waiting count): she still can't add until she is under the limit.

**S14 · Reaction flood** `@social` · twist: tv clean
1. Four phones spam clap/fire/laugh/heart/party as fast as they can for 5 s.
2. Each person gets at most 1 reaction per 500 ms through; the TV shows them without freezing or building a backlog after the spamming stops.
3. Hana turns reactions off live: the buttons disappear on phones and sent reactions are ignored.
4. A reaction sent just as the song ends doesn't crash or land on the next song's recap.

**S15 · Awards after the song** `@social` · twist: count 1, E2E_FAST award window
1. Ana's song ends. An award prompt appears on every phone except Ana's, with its own closing countdown.
2. Ben gives "Nailed it"; his prompt closes. Ben can't give a second one for the same song. Ana can't give one for her own song.
3. Cleo's song starts (next countdown) while the award window is still open: the prompt shows for the right song and the two countdowns (award closing, get-ready) don't mix.
4. The window closes by itself: prompts disappear; counts appear on the recap.
5. Hana turns awards off: no prompt after the next song.

## C. Host powers

**S16 · Co-host** `@host` · twist: view large
1. Hana makes Ben co-host. Ben's phone gets host controls (skip, move, kick, settings) and the toast about the new role.
2. Ben skips a song, moves one, changes the queue mode. He can't end the party or change roles (`not_allowed`).
3. Ben adds five songs: exempt from the limit like Hana.
4. Hana demotes Ben: controls vanish live, no refresh.
5. Ben is co-host and goes offline for 3 s and back: still co-host.

**S17 · Kicked** `@host` · twist: tv bar-small
1. Dev is singing; Hana kicks him. His song is skipped, next countdown starts, Dev's phone shows "kicked" and goes home.
2. His other waiting songs are gone. Others' rotation order is unchanged.
3. Dev uses the join link again. Record what happens (there is no per-device block yet; this scenario documents the current behavior and fails loudly if it changes).
4. Hana kicks a member who has an open award prompt: no errors on other phones.

**S18 · Lock the door** `@join` · twist: lang es, join start
1. Hana locks the party. Eli opens the join link and sees "the host has locked this room"; his typed code stays filled in.
2. Ana, already in, closes and reopens the tab: gets back in (locked rooms still accept existing members).
3. Hana unlocks. Eli presses Join again: he is in, no refresh needed.
4. Hana locks, and Fay joins the same instant: either one or the other, and the room never ends up with a half-member.

**S19 · Gran has no phone** `@host` · twist: mode rotation, tv bar-large
1. Hana adds "Gran" (no phone). Gran appears in the members list, always "here".
2. Hana adds two songs "as Gran". Gran gets her turn in the rotation like anyone.
3. Gran can't be given awards-giving, co-host or reactions; the buttons don't exist for her.
4. Hana removes Gran: her waiting songs go; if she is singing, the song is skipped.
5. Hana leaves for 3 s (E2E_FAST) with Gran in the room: Gran is never picked as stand-in host.

**S20 · Host edits the queue** `@host` · twist: view tablet, mode fifo
1. 6 songs queued by 4 people. Hana drags the last to the top, moves one down, "play next" on another, removes two.
2. Every phone shows the new order live (C1). Owners see their own song gone.
3. Ana removes her own song; she can't remove Ben's (`not_allowed`).
4. Hana removes the song that is in its countdown: the next one takes over with a full countdown.

**S21 · Show the code on the TV** `@tv @join` · twist: join between → always → start
1. Between songs the TV shows the join QR with the code. During a song it doesn't.
2. Hana presses "Show code on TV": QR appears over the song for ~15 s, then goes.
3. Switch to "always": QR stays over the song. "start": only in the lobby, never on the get-ready card.
4. Someone joins by QR (new phone) during a song, adds a song, all without disturbing playback.

## D. Leaving, dropping and returning

**S22 · A guest leaves with songs waiting** `@leaving` · twist: mode rotation
1. Ana has 2 waiting, Ben 1, Cleo 1. Ana leaves (confirm dialog).
2. Ana's songs vanish from every phone; order is Ben, Cleo; Ana's phone shows the home page.
3. Ana joins again with the code: new member, no songs, the rotation treats her as new.
4. Ana's old stored credentials don't bring back the old member.

**S23 · The singer leaves** `@leaving @countdown` · twist: count 3
1. Ben is singing. He leaves. His song is skipped, the TV shows the next singer's get-ready card with a full countdown; no frozen player.
2. Cleo's song is in countdown. Cleo leaves: playback goes to the next (or idle) with no leftover countdown anywhere (C2).
3. A duet where one partner leaves mid-song: the song goes on for the other.

**S24 · The host leaves** `@leaving` · twist: lang es, tv clean
1. Hana presses Leave: the dialog says leaving ends the party for everyone.
2. TV shows the end screen; every phone shows the end story/recap; all sockets close.
3. A new person opens the join link: "the party has ended".
4. The recap page works for everyone, including the ones who left earlier.

**S25 · The host's laptop sleeps (stand-in host)** `@leaving @host` · twist: E2E_FAST, view small
1. Hana, Ben (co-host), Ana (guest) in the party; Hana's tab closes.
2. Others see Hana "Offline". After the shortened timer Ben becomes "Temporary host" with host controls; Ana does not.
3. Hana returns: she is host again, Ben goes back to co-host. TV and phones show no stuck banner.
4. Repeat with no co-host: the guest who has been in the room longest becomes stand-in; when Hana returns that guest is a guest again.
5. Stand-in host skips a song and ends nothing; the real host can still end the party.

**S26 · A guest's phone goes to sleep** `@leaving` · twist: mode rotation, count 3
1. Cleo has 2 songs waiting, then her phone loses the connection. Hana sees her "Offline" and a "Remove all of Cleo's songs" action.
2. Her turn comes: the get-ready card shows Cleo's name; there is no auto-skip (by design). Hana skips manually.
3. Hana uses "Remove all of Cleo's songs": queue updates everywhere.
4. Cleo's phone wakes during her turn: she rejoins with the same identity and sees the right screen immediately.

**S27 · Bad network** `@resilience` · twist: view small
1. Ben goes offline during "add song": the add is not shown as done; when online it either goes through once or he sees an error. Never twice.
2. Offline for 15 s while songs play: his phone shows reconnecting, then catches up with the right queue and a correct countdown if one is running (C2).
3. Hana's connection drops while the TV keeps playing: songs continue, queue advances; on return she sees everything that happened.
4. Server restarts (dev API restarted): all surfaces reconnect with backoff, no one is thrown out.

**S28 · Coming back on the same device** `@join` · twist: lang en
1. Ana closes the tab and opens the site later: the home page offers "Back to your party"; one tap goes to the room.
2. Hana, the host, does the same and goes back to the host app, not the guest view.
3. The party ended meanwhile: Ana sees "We couldn't bring you back" and a way to start over, not a loading loop.
4. Ana joins a second party: the old spot is replaced, not kept.

**S29 · Wrong, old and odd codes** `@join` · twist: lang es
1. Typing "Fuzzy Golden  Panda" or with capitals/extra spaces finds the same room.
2. A code that doesn't exist says so and keeps what was typed. A code of the wrong shape never calls the server.
3. An ended party's code says it ended. A room code of someone else's old party never shows another party's data.
4. Rapid retries hit the rate limit: a friendly message, and the form still works afterward.
5. `/r/<code>` directly in a fresh browser without joining goes to the join page with the code filled in.

## E. The TV

**S30 · Pair a TV with a code** `@tv` · twist: E2E_FAST, tv bar-medium
1. TV opens `/tv`: shows a 6-character code and a countdown to renewal. Host enters it in Settings → TV screen: TV flips to the lobby for this party.
2. Before pairing, a second TV page shows the same code; when it renews, the first code stops working (host gets an error with the old code).
3. Pair a second screen: the first gets `screen_removed` and returns to `/tv` with a new code. Host sees only one screen.
4. Host removes the screen: it goes back to a code.
5. A wrong code shows a clear error and doesn't pair.
6. The code's renewal counter is correct (never negative, doesn't restart on re-render).

**S31 · The TV window closes mid-song** `@tv @countdown` · twist: count 3
1. Mid-song, close the TV page. Host sees "Your paired TV isn't connected" / "Reopen TV window"; phones keep showing the song.
2. The queue still advances? (Expected: the room waits; documents the behavior.) Songs added meanwhile wait.
3. TV page reopens: it presses Start and resumes the same song at roughly the right position.
4. Close the TV during a countdown, reopen after it ended: the song starts, no frozen counter (see S03).
5. Open two TV pages at once for one party: only one is the player.

**S32 · A video that can't play** `@tv @songs` · twist: count 1, view small
1. The fake YouTube reports an embed error on Ana's song. Ana and Hana get "couldn't play" (with the title); the song is skipped.
2. Next singer's countdown starts immediately and normally.
3. Three unplayable songs in a row: each skipped, no loop, no stuck `get_ready`.
4. The fake player never starts (no event at all): after the start timeout the song is skipped like an error.
5. A song whose length is unknown (0) gets its real length from the player; progress bars fix themselves.

**S33 · TV looks** `@tv` · twist: every tv layout
1. While a song plays: change layout bar → clean and bar sizes small/medium/large live. Nothing covers the video in "bar"; the bar's height is 9/13/18 % of the screen.
2. Same changes during the get-ready card and in the lobby. The bar only shows during a song.
3. The fullscreen button works and the layout survives it.
4. Refresh the TV after each change: the setting persists.
5. A very long song title and a very long nickname don't break the bar or the card.

## F. Accounts, language, content, recap

**S34 · Accounts and friends** `@accounts` · twist: mode rotation
1. Hana registers and logs in. Her settings (queue mode, countdown, TV layout) apply to the next party she creates.
2. Ana registers, adds Hana as a friend; both see each other.
3. Ana adds two songs to favorites in the party and finds them in her profile.
4. Hana starts a party, signs in on a second device: "your open parties" shows it and takes her back as the host.
5. The party ends: it appears in the party log for each signed-in member; guests have none.

**S35 · A night in Spanish** `@i18n` · twist: lang es, view small
1. Everything on every phone and the TV in Spanish. Plural rules (1 canción / 2 canciones; "te toca en 1 canción") are right.
2. Ben switches his phone to English mid-party: only his phone changes; the TV stays Spanish.
3. No English leftovers in the host app, award prompts, titles, recap page and recap image.
4. Reload with `?lang` unset: language comes from the saved choice, then the browser.

**S36 · Finding songs** `@search` · twist: view tablet
1. Home chips (genre) show songs; "More" loads more without freezing typing.
2. Typing "quen" as you type finds Queen; a typo ("bohemain") still finds the song; Spanish accents match without them.
3. Search "Show more" appends, with no duplicates.
4. Pasting a YouTube link (host only) shows "From your link"; guests pasting get the bad-link message.
5. Search with the live YouTube fallback unavailable (503): "Search is resting", paste-a-link advice for the host.
6. Videos that can't be embedded never appear.

**S37 · Recap and sharing** `@recap` · twist: lang en then es
1. Six performances by four people end the party. The recap lists them in order with cheers.
2. Each person gets 2–3 titles that match what happened (opening act, grand finale, crowd favorite, biggest fan…) and the top moment is the most-cheered one.
3. The public link `/recap/<id>` opens in a logged-out browser. The share image downloads and isn't blank.
4. Titles off: recap shows performances, no titles.
5. A party with zero songs: friendly empty recap, no crash. A party with one song: only sensible titles.
6. An unknown recap id: a clear not-found page.

**S38 · Phones of all sizes** `@ui` · twist: view small / large / tablet
1. Join, search, queue, now-singing, party and award prompt screens at 360, 430 and 820 px: no horizontal scroll, nothing cut off, buttons ≥ 44 px.
2. Keyboard open on the search page doesn't hide the mini player's countdown or the add buttons.
3. Landscape rotation on the TV and the phone.
4. Privacy and Terms pages open in both languages and from the footer.

## G. Everything at once

**S39 · Grand finale** `@chaos` · twist: all of them
Eight people, TV, co-host, Spanish for two phones, rotation → approval → fifo.
1. Hana pairs the TV, Ben is co-host. Six guests join, one duplicates a name; Gran added.
2. Songs, a duet, a group song, and a pasted link all queued within 30 s.
3. Mid-song: TV closed and reopened; Cleo's phone drops and returns; Eli leaves with songs waiting; Dev is kicked.
4. Queue mode switched twice, limit changed, reactions off/on, a song unplayable, countdown set to 1 s.
5. Hana's tab closes: stand-in takes over, Hana returns.
6. Awards given while the next song counts down.
7. Hana ends the party. C1–C8 held at every step; recap lists exactly the songs that were played, with titles for people still in the party.

**S40 · Random night (seeded)** `@chaos`
Instead of a fixed script: 5 phones, a TV and a host take 150 random actions (add, remove, skip, pause, leave, rejoin, kick, change a setting, reload a surface, drop a connection, react, give an award…) chosen by a seeded random generator, with C1–C8 checked after each one. The seed is printed; `pnpm e2e S40 --seed 1234` replays the exact night. This is the scenario most likely to find the unexpected bug, and every bug it finds should become a fixed scenario of its own.

---

## Status: all 40 are built

They live in `e2e/scenarios/` (see `e2e/README.md` for how to run them). Writing and running them found these real
problems, all fixed:

- **Counter stuck at 0 (S03).** The room starts the countdown as soon as a song is added, even with no TV open, and stays in "get ready" until the TV reports the song started. Phones and the host bar showed a dead "0" for as long as the TV was missing (or waiting for its Start click). They now say "Waiting for the TV…" two seconds after the countdown ends.
- **Paused song plays after a TV refresh (S05).** Refresh the TV while a song is paused: the room said "Paused", the TV played anyway, and its first "started" report flipped the room back to "playing". The TV now comes back paused and the room stays paused.
- **Turn alerts always in English (S35).** "Get ready, you're up!", "You're up next!", "You're up in 2 songs" and the host's alerts about guests without phones were hard-coded English, even on Spanish phones. They now use the translations.

Behaviour the scenarios pin down (worth knowing, not changed):

- Pause, restart and resume during a countdown are ignored by the room; the song in its countdown can't be removed from the queue (skip is the way) (S04).
- When someone leaves while their duet is on, the song carries on and the leaver stays on the record of who started it (S23); a waiting duet drops the leaver (S10).
- A kicked person can join again from the same browser; there is no per-device block yet (S17).
- The bar layout always shows the join QR + code; the "when to show the code" setting only affects the full-screen layout (S21).
- The award window is not "closed" by a broadcast when its time runs out; screens go by its `closesAt` (S15).
- While the host is away, the stand-in has the host role, so by the room's rules they could also end the party or remove the real host (who waits as a co-host). Read from the code, not tested.
- A search result row tapped in the real app adds the song straight away.

Not automated: restarting the API while a party runs (S27 part 4), and the real YouTube player (the tests use a fake one).

## Order they were built in

S01–S05 first (they cover the counter), then each group in the order above, then S39 and S40.
