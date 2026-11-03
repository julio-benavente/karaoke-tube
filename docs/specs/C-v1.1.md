# Spec C: v1.1 party features

The plan's v1.1 milestone, on top of the MVP (Specs A + B, integrated on `main`). One track builds it end to end:
API, room, client UI, TV overlay. Contract changes are in `contract: v1.1` (see README "Contract changes").

Decisions: build all of v1.1. Rating is **positive awards** (no stars, no low scores). Every feature is a **host
toggle** in Settings (`duets`, `turnAlerts`, `awards`, `titles`, plus the new queue mode), on by default.

## Tasks (in order)

### C1. Duets & group songs ✅
- Adding a song can name partners from the room (`singerIds` with more than one member) or mark it
  **Everyone sings** (`everyone: true`). Guests must be one of the singers; with `duets` off, guests add solo only.
- Rotation: a duet uses one turn for **each** singer. An item's round is the latest next-round of its singers;
  each singer's next round moves past it. Group songs count for the person who added them.
- The queue limit counts a duet for each singer.
- UI: "Sing with…" picker in the phone's song sheet and the host's add flow; queue rows, now-singing, TV chips and
  the get-ready card show "Ana & Ben" or "Everyone".

**Done when:** queue tests cover duet rotation and limits; a duet added from a phone shows both names on the TV.

### C2. Turn alerts ✅
- Phones show "You're up in 2 songs" and then "You're up next!" (with a vibration where supported), computed from
  `upNext`. Host toggle `turnAlerts`.

**Done when:** the banner appears for the right guest at the right positions.

### C3. Positive awards ✅
- When a song that really started ends (or is skipped after starting), the room opens `awardWindow` for 60 s.
  Members who didn't sing it can give **one** award each: Nailed it 🎯, Great vibes ✨, Crowd pleaser 🙌, Brave pick 💪.
- Reactions are now counted per performance (for titles). Host toggle `awards`.
- UI: an award sheet on phones after a song (not for the singers), with counts on the TV.

**Done when:** tests cover one-award-per-member, singers can't award themselves, window closes, toggle off.

### C4. End-of-night titles ✅
- `apps/api/src/titles.ts`: a pure function that turns what happened (performances, reactions, awards, joins) into
  2–3 positive titles per member, from the plan's list. Titles needing data we don't have (song year, language,
  views) are skipped. Everyone gets at least two (fallbacks: Brave Soul, Great Audience, Party Spirit).
- On `end_party` the room builds a `Recap` (titles empty if `titles` is off) and puts it in `RoomState.recap`.

**Done when:** unit tests for the titles function (winners, ties, everyone ≥ 2, toggle off).

### C5. Awards show + recap (built; browser e2e not run)
- TV: an awards show cycling through members and their titles after the party ends (presentational component in
  `packages/ui/src/tv`, rendered by the content script when `recap` is present).
- Phones: a story of your titles (tap through), then everyone's titles and the recap link.
- Recap saved in KV (`RECAPS`) for 30 days: `GET /api/recaps/:id` and the web page `/recap/:id` with share/copy.

**Done when:** ending a party shows the awards show on the TV, the story on phones, and `/recap/:id` loads.

### C6. "Host picks" queue mode ✅
- `queueMode: "approval"`: guests' songs go to `RoomState.pending` (status `"pending"`); hosts approve (→ queue) or
  decline (→ removed). Hosts' own songs skip the line. Switching the mode off lets every pending song in.
- UI: pending list with approve/decline in the host app's queue panel and for co-hosts on phones; guests see
  "Waiting for the host's OK".

**Done when:** tests cover pending, approve, decline, switching modes; the host app approves a phone's song.

## Out of scope
Song suggestions, the avatar builder (another track), D1, kid-friendly filter, break timer.
