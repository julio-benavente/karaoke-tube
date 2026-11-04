import { test, expect } from "../lib/night";
import type { Night } from "../lib/night";
import { sleep, Phone } from "../lib/people";
import { song } from "../lib/songs";
import { REACTIONS } from "@karaoke-tube/shared";

// A night made of random actions. The same seed always makes the same choices:
//   E2E_SEED=1234 pnpm e2e s40        E2E_ACTIONS=150 pnpm e2e s40
// The watcher (C2, C3, C6) runs the whole time; at the end everything must settle and agree.
const SEED = Number(process.env.E2E_SEED ?? Date.now() % 100000);
const ACTIONS = Number(process.env.E2E_ACTIONS ?? 60);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test(`S40 · Random night, seed ${SEED} @chaos`, async ({ night }) => {
  test.setTimeout(420_000);
  const rand = rng(SEED);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const log: string[] = [`seed ${SEED}, ${ACTIONS} actions`];
  test.info().annotations.push({ type: "seed", description: String(SEED) });

  const { host } = await night.setup({ countdown: 1, songSec: 3, settings: { maxWaitingPerMember: 3 } });
  let tv = night.tv!;
  night.watcher.allow("stuck", "noCountdown", "C1", "C8"); // screens are knowingly disturbed; the end checks the agreement
  let songN = 0;
  const names = ["Ana", "Ben", "Cleo", "Dev", "Eli"];
  const live: Phone[] = [];
  for (const n of names) live.push(await night.join(n));
  let joinN = 0;

  const state = () => host.state();
  const guard = async (what: string, fn: () => Promise<unknown>) => {
    log.push(what);
    try {
      await fn();
    } catch (e) {
      log.push(`  (ignored: ${String((e as Error).message).split("\n")[0].slice(0, 100)})`);
    }
  };
  const newSong = () => {
    songN++;
    const s = song(`f${songN}`);
    return rand() < 0.08 ? { ...s, videoId: `e2e-song-bad${songN}` } : s;
  };
  await tv.fake({ failing: {} });
  const failing = async () => {
    const s = (await state())!;
    const bad: Record<string, boolean> = {};
    for (const i of [s.nowPlaying, ...s.upNext, ...(s.pending ?? [])]) if (i?.song.videoId.includes("-bad")) bad[i.song.videoId] = true;
    if (night.tv) await night.tv.fake({ failing: bad }).catch(() => {});
  };

  const actions: Array<[number, string, () => Promise<void>]> = [
    [8, "a guest adds a song", async () => { const p = pick(live); await p.addSong(newSong()); await failing(); }],
    [3, "the host adds a song", async () => { await host.addSong(newSong()); await failing(); }],
    [2, "a guest removes their own song", async () => {
      const p = pick(live); const id = await p.memberId(); const s = (await state())!;
      const mine = s.upNext.find((i) => i.singerIds.includes(id)); if (mine) await p.send({ type: "remove_song", itemId: mine.id });
    }],
    [2, "the host skips", async () => host.send({ type: "skip" })],
    [1, "the host pauses", async () => host.send({ type: "pause" })],
    [2, "the host resumes", async () => host.send({ type: "resume" })],
    [3, "someone reacts", async () => pick(live).send({ type: "react", reaction: pick([...REACTIONS]) })],
    [2, "someone gives an award", async () => {
      const s = (await state())!; if (s.awardWindow) await pick(live).send({ type: "give_award", itemId: s.awardWindow.item.id, award: "nailed_it" });
    }],
    [2, "the host moves a song to the top", async () => {
      const s = (await state())!; if (s.upNext.length > 1) await host.send({ type: "move_song", itemId: pick(s.upNext).id, toIndex: 0 });
    }],
    [2, "the host changes a setting", async () => host.send({ type: "update_settings", settings: pick([
      { queueMode: "fifo" as const }, { queueMode: "rotation" as const }, { maxWaitingPerMember: 1 + Math.floor(rand() * 3) },
      { countdownSec: Math.floor(rand() * 4) }, { reactions: rand() < 0.5 }, { duets: rand() < 0.7 }, { awards: rand() < 0.7 },
    ]) })],
    [1, "approval mode on, a guest's song approved", async () => {
      await host.send({ type: "update_settings", settings: { queueMode: "approval" } });
      await pick(live).addSong(newSong()); await sleep(300);
      const s = (await state())!; if (s.pending?.[0]) await host.send({ type: "approve_song", itemId: s.pending[0].id });
      await host.send({ type: "update_settings", settings: { queueMode: "rotation" } });
    }],
    [2, "a duet", async () => {
      const [a, b] = [pick(live), pick(live)]; if (a === b) return; await a.addSong(newSong(), { singerIds: [await a.memberId(), await b.memberId()] });
    }],
    [1, "a song for everyone", async () => pick(live).addSong(newSong(), { everyone: true })],
    [2, "a phone reloads", async () => pick(live).reloadAndSettle()],
    [1, "the TV reloads", async () => { await tv.reload(); await tv.pressStart(); await tv.fake({ defaultDuration: 3 }); await failing(); }],
    [2, "a phone drops for a moment", async () => { const p = pick(live); p.setNetwork(false); await sleep(1500 + rand() * 2500); p.setNetwork(true); }],
    [1, "a guest leaves and someone new joins", async () => {
      const p = pick(live); await p.send({ type: "leave" }); live.splice(live.indexOf(p), 1);
      joinN++; live.push(await night.join(`New${joinN}`));
    }],
    [1, "the host kicks a guest and someone new joins", async () => {
      const p = pick(live); await host.send({ type: "kick", memberId: await p.memberId() }); live.splice(live.indexOf(p), 1);
      joinN++; live.push(await night.join(`Fresh${joinN}`));
    }],
    [1, "a guest becomes co-host, or goes back", async () => {
      const p = pick(live); const id = await p.memberId(); const s = (await state())!;
      const was = s.members.find((m) => m.id === id)?.role; await host.send({ type: "set_role", memberId: id, role: was === "cohost" ? "guest" : "cohost" });
    }],
    [1, "the host's page reloads", async () => host.reloadAndSettle()],
  ];
  const bag = actions.flatMap(([w, name, fn]) => Array.from({ length: w }, () => [name, fn] as const));

  for (let i = 0; i < ACTIONS; i++) {
    const [name, fn] = pick(bag);
    await guard(`#${i + 1} ${name}`, fn);
    await sleep(250 + rand() * 650);
  }

  // The end: everything settles. Every screen agrees, nothing is stuck, the party ends with a recap.
  log.push("settling");
  await host.send({ type: "update_settings", settings: { queueMode: "rotation", countdownSec: 1, reactions: true } }).catch(() => {});
  await host.send({ type: "resume" }).catch(() => {});
  await failing();
  await host.waitForState("the queue drains", (s) => !s.nowPlaying && s.upNext.length === 0 && (s.pending?.length ?? 0) === 0, 150_000).catch(async (e) => {
    await test.info().attach("actions.txt", { body: log.join("\n") });
    throw e;
  });
  const settled = (await state())!;
  for (const p of live) {
    await expect
      .poll(async () => {
        const s = await p.state();
        return !!s && s.nowPlaying?.id === settled.nowPlaying?.id && s.upNext.length === settled.upNext.length;
      }, { timeout: 20_000, message: `${p.name} agrees with the host once things settle` })
      .toBe(true);
  }
  await host.send({ type: "end_party" });
  const ended = await host.waitForState("ended", (s) => s.status === "ended" && !!s.recap);
  const ids = ended.recap!.performances.map((p) => p.item.id);
  expect(new Set(ids).size, "no performance twice in the recap").toBe(ids.length);
  await test.info().attach("actions.txt", { body: log.join("\n") });
  void (night as Night);
});
