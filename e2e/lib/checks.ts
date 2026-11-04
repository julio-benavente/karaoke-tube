import type { RoomState } from "@karaoke-tube/shared";
import { en } from "../../packages/ui/src/i18n/en";
import { Person, summary } from "./people";

const KEYS = new Set(Object.keys(en));

/**
 * Runs beside a scenario and watches every screen, every ~250 ms. It never fails the test on the spot; it records
 * what it saw (with the time), and the scenario fails at the end if the list isn't empty. See docs/e2e-scenarios.md.
 */
export class Watcher {
  readonly violations: string[] = [];
  private running = false;
  private loop: Promise<void> | null = null;
  private t0 = Date.now();
  private seen = new Set<string>();
  /** Checks a scenario switches off on purpose (it is testing exactly that situation). */
  private off = new Set<string>();
  private diffSince = new Map<string, number>();
  private lastPos = new Map<string, number>();
  private lastCount = new Map<string, { endsAt: number; n: number }>();
  /** Extra things a scenario wants checked every tick (only when the screens have all had a first state). */
  private extra: Array<(states: Array<{ who: Person; state: RoomState }>) => string | null> = [];

  constructor(private readonly people: () => Person[]) {}

  /** Switch checks off: "C1" … "C3", "stuck" (get-ready may outlast its countdown), "noCountdown". */
  allow(...checks: string[]) {
    for (const c of checks) this.off.add(c);
  }
  forbidAgain(...checks: string[]) {
    for (const c of checks) this.off.delete(c);
    if (checks.includes("C8")) this.lastPos.clear();
  }
  also(fn: (states: Array<{ who: Person; state: RoomState }>) => string | null) {
    this.extra.push(fn);
  }

  start() {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        await this.tick().catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
      }
    })();
  }

  async stop() {
    this.running = false;
    await this.loop;
    for (const p of this.people()) for (const text of p.problems) this.add("C6", text);
  }

  private add(check: string, text: string) {
    const key = `${check} ${text}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.violations.push(`[${check} +${((Date.now() - this.t0) / 1000).toFixed(1)}s] ${text}`);
  }

  private async tick() {
    const states: Array<{ who: Person; state: RoomState }> = [];
    const snaps = new Map<Person, { countdowns: number[]; text: string; at: number }>();
    await Promise.all(
      this.people().map(async (who) => {
        const snap = await who.snapshot();
        if (snap?.state && snap.open) {
          states.push({ who, state: snap.state });
          snaps.set(who, snap);
        }
      }),
    );
    const now = Date.now();

    for (const { who, state } of states) {
      const snap = snaps.get(who)!;
      // C3: one thing playing; idle exactly when nothing is.
      if (!this.off.has("C3")) {
        const pb = state.playback.state;
        if (!state.nowPlaying && pb !== "idle") this.add("C3", `${who.name}: nothing is playing but playback is ${pb}`);
        if (state.nowPlaying && pb === "idle") this.add("C3", `${who.name}: ${state.nowPlaying.song.title} is playing but playback is idle`);
        if (state.nowPlaying && state.upNext.some((i) => i.id === state.nowPlaying!.id)) this.add("C3", `${who.name}: the song playing is also in the queue`);
        const ids = state.upNext.map((i) => i.id);
        if (new Set(ids).size !== ids.length) this.add("C3", `${who.name}: a song is in the queue twice`);
      }

      // C2: the countdown on this screen matches the room's.
      if (!this.off.has("C2")) this.checkCountdown(who, state, snap.countdowns, snap.at);

      // C6: no raw translation keys on screen.
      if (!this.off.has("C6")) {
        const text = snap.text;
        for (const token of text.match(/[a-z]+(?:\.[a-zA-Z_]+)+/g) ?? []) {
          if (KEYS.has(token)) this.add("C6", `${who.name} shows the raw key "${token}"`);
        }
        if (/\b(undefined|NaN|\[object Object\])\b/.test(text)) this.add("C6", `${who.name} shows "undefined"/"NaN" on screen`);
      }
    }

    // C1: every screen tells the same story (given 2 s to catch up).
    if (!this.off.has("C1") && states.length > 1) {
      const sig = (s: RoomState) => JSON.stringify([s.status, s.nowPlaying?.id ?? null, s.upNext.map((i) => i.id), s.playback.state, s.members.map((m) => [m.id, m.role])]);
      const ref = sig(states[0].state);
      for (const { who, state } of states.slice(1)) {
        const k = who.name;
        if (sig(state) === ref) this.diffSince.delete(k);
        else {
          const since = this.diffSince.get(k) ?? now;
          this.diffSince.set(k, since);
          if (now - since > 2500) this.add("C1", `${who.name} disagrees with ${states[0].who.name} for ${((now - since) / 1000).toFixed(1)}s:\n   ${JSON.stringify(summary(state))}\n   ${JSON.stringify(summary(states[0].state))}`);
        }
      }
    }

    // C8: a song's position only moves forward (a restart is the one way back: switch this off around it).
    if (!this.off.has("C8")) {
      for (const { who, state } of states) {
        const item = state.nowPlaying;
        if (!item) continue;
        const key = `${who.name}:${item.id}`;
        const pos = state.playback.state === "playing" ? state.playback.positionSec + (now - state.playback.updatedAt) / 1000 : state.playback.positionSec;
        const prev = this.lastPos.get(key);
        if (prev !== undefined && pos < prev - 1.5) this.add("C8", `${who.name}: the position of ${item.song.title} went back from ${prev.toFixed(1)}s to ${pos.toFixed(1)}s`);
        this.lastPos.set(key, Math.max(prev ?? 0, pos));
      }
    }

    for (const fn of this.extra) {
      const r = fn(states);
      if (r) this.add("X", r);
    }
  }

  private checkCountdown(who: Person, state: RoomState, shown: number[], now: number) {
    const pb = state.playback;
    if (pb.state !== "get_ready" || !pb.countdownEndsAt) {
      this.lastCount.delete(who.name);
      if (shown.length && pb.state !== "get_ready") {
        // A countdown still on screen after the room left get_ready: allowed for one tick of lag.
        const k = `late:${who.name}`;
        const since = this.diffSince.get(k) ?? now;
        this.diffSince.set(k, since);
        if (now - since > 1500) this.add("C2", `${who.name} still shows a countdown (${shown.join(",")}) but the room is ${pb.state}`);
      } else this.diffSince.delete(`late:${who.name}`);
      return;
    }
    this.diffSince.delete(`late:${who.name}`);
    const msLeft = pb.countdownEndsAt - now;
    const expected = Math.max(0, Math.ceil(msLeft / 1000));

    // Stuck: the countdown is over but the room is still in get_ready (the TV never said "started").
    if (!this.off.has("stuck") && msLeft < -4000) {
      this.add("C2", `${who.name}: the room is still "get ready" after its countdown ended (song: ${state.nowPlaying?.song.title})`);
    }
    if (!this.off.has("noCountdown") && msLeft > 1500 && shown.length === 0) {
      this.add("C2", `${who.name} shows no countdown, ${expected}s left (room is get_ready)`);
    }
    for (const n of shown) {
      if (Math.abs(n - expected) > 1) this.add("C2", `${who.name} shows ${n}, but ${expected} is left`);
    }
    const prev = this.lastCount.get(who.name);
    const cur = shown.length ? Math.min(...shown) : null;
    if (cur !== null) {
      if (prev && prev.endsAt === pb.countdownEndsAt && cur > prev.n) this.add("C2", `${who.name}'s countdown went up from ${prev.n} to ${cur}`);
      this.lastCount.set(who.name, { endsAt: pb.countdownEndsAt, n: cur });
    }
  }
}
