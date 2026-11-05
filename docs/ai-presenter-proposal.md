# AI presenter: proposal (needs Julio's decision)

Status: not built. "Let's add an AI presenter" is too open to build blind, so this is a short proposal with a recommendation. Answer the four questions at the bottom and it can be built in about a day.

## What it is

A host-like character for the TV that talks between songs, like a karaoke-bar MC. It does not sing and does not replace the host. It makes the room feel alive when nobody is talking.

## What it says, and when

Short lines (one or two sentences, 25 words at most), always in the session language (English or Spanish, same rule as the rest of the app). Triggers the room already knows about:

| Moment | Example | Source in the room |
|---|---|---|
| Party starts, TV is idle | "Welcome! Scan the code, pick a song, and don't be shy." | `status` becomes active, empty queue |
| Next singer is announced (get-ready card) | "Up next: Ana with Dancing Queen. Give it up for Ana!" | `playback.state === "get_ready"` |
| Song ends | A light comment on the song and the cheers it got | `awardWindow` opens, `cheers` count |
| Long gap with nobody queued | A nudge: "The queue is empty. Who's brave?" | `upNext` empty for 60 s |
| Last song, recap | Reads out the night and the titles | `RoomState.recap` |

Rules: at most one line per trigger, never over a singing video, a host switch (`aiPresenter` setting, default off) and a "quiet" cooldown (no more than one line per 45 s).

## Voice or text

Start with **text on the TV** (a caption card in the existing TV layer), plus optional **browser speech** (`speechSynthesis`) on the TV page. Free, no latency, works in English and Spanish voices already on the device, no audio files. The quality is robotic, so make it a toggle.

Later, if Julio likes it, swap in a real text-to-speech service on the server. That adds a vendor, a key and a per-character cost, so it is a separate decision.

## Which model

Lines are tiny and need to be fast and cheap, not deep. Recommendation: **`claude-sonnet-5-5`** for quality in both languages (it is the model id this project's tooling runs on today). If cost matters more than polish, a smaller Haiku-class model is enough for these lines; confirm the exact current Haiku id in the Claude API docs before wiring it, do not guess it.

## Cost

Each line is about 300 input tokens (system prompt, song, singer name, language) and 40 output tokens. A 3-hour party with 40 songs is about 60 lines, so roughly 20k input and 2.5k output tokens per party. Multiply by the current per-token price of the chosen model: at these sizes it is a fraction of a cent to a few cents per party. Prompt caching on the fixed system prompt makes the input part smaller again. Budget guard: a hard cap of 80 lines per room, and none when `aiPresenter` is off.

## How it fits the architecture

- **Where it runs:** the API worker (`apps/api`), not the browser, so the Anthropic key stays secret. Add `ANTHROPIC_API_KEY` as a Worker secret.
- **Who triggers it:** the room Durable Object (`apps/api/src/durable-objects/room.ts`) already knows every moment in the table above. On a trigger it calls a small `presenter.ts` helper (one `fetch` to the Messages API, 3 s timeout, fall back to a canned line from a per-language list if it fails, so the show never waits on the model).
- **Contract (additive):** `RoomSettings.aiPresenter?: boolean` (default false) and a `ServerMessage` `presenter_line { text, lang, kind }`. Host panel gets one toggle in Quick settings.
- **Who shows it:** the TV page (`apps/web/src/tv`) renders the line as a card in `TvLayer` and, if enabled, speaks it with `speechSynthesis`. Phones ignore it, or show it as a toast.
- **Safety:** the prompt only gets nicknames and song titles. Nicknames are guest-typed, so the prompt tells the model to treat them as names, never as instructions, and the server trims and length-limits the output.

## Decisions needed from Julio

1. Should the presenter exist at all, and should it be off by default?
2. Text only, text plus browser voice, or a real TTS voice (extra vendor and cost)?
3. How chatty: only at song changes, or also jokes, trivia and nudges?
4. Quality or price: `claude-sonnet-5-5`, or a smaller Haiku-class model?
