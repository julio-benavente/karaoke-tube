import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";

test("S04 · Host controls during a countdown @core @countdown", async ({ night }) => {
  await night.startParty("Hana");
  const tv = await night.openTv();
  await tv.fake({ defaultDuration: 4 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const cleo = await night.join("Cleo");
  const { host } = night;
  await host.send({ type: "update_settings", settings: { countdownSec: 10, queueMode: "fifo" } });

  await ana.addSong("bohemian");
  await ben.addSong("uptown");
  const s0 = await host.waitForState("Ana's countdown", (s) => s.playback.state === "get_ready" && s.nowPlaying?.song.videoId === "e2e-bohemian");

  // 1. Pause, restart and resume do nothing during a countdown.
  for (const type of ["pause", "restart", "resume"] as const) await host.send({ type });
  await sleep(700);
  const s1 = (await host.state())!;
  expect(s1.playback.state).toBe("get_ready");
  expect(s1.playback.countdownEndsAt).toBe(s0.playback.countdownEndsAt);
  expect(s1.nowPlaying?.id).toBe(s0.nowPlaying?.id);

  // 2. The song in its countdown can't be removed from the queue (skip is the way).
  await host.send({ type: "remove_song", itemId: s0.nowPlaying!.id });
  await expect.poll(() => host.errors()).toContain("not_allowed");
  expect((await host.state())!.nowPlaying?.id).toBe(s0.nowPlaying?.id);

  // 3. Skip: Ben's song gets a full, fresh countdown.
  await sleep(1500);
  await host.send({ type: "skip" });
  const s2 = await host.waitForState("Ben's countdown", (s) => s.playback.state === "get_ready" && s.nowPlaying?.song.videoId === "e2e-uptown");
  expect(s2.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(8_500);

  // 4. Skip again with nobody waiting: the room goes idle and the TV has no countdown left.
  await host.send({ type: "skip" });
  await host.waitForState("idle", (s) => s.playback.state === "idle" && !s.nowPlaying);
  await expect.poll(() => tv.countdowns()).toEqual([]);

  // 5. A new song right after: a fresh countdown, and it plays.
  await cleo.addSong("hello");
  const s3 = await host.waitForState("Cleo's countdown", (s) => s.playback.state === "get_ready");
  expect(s3.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(8_500);
  await host.send({ type: "update_settings", settings: { countdownSec: 2 } });
  await host.waitForState("playing", (s) => s.playback.state === "playing", 20_000);
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);
});
