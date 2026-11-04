import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S27 · Bad network @resilience", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 3, songSec: 6 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  await tv!.fake({ durations: { "e2e-song-a1": 120 } });
  await ana.addSong(song("a1"));
  await host.waitForState("Ana is singing", (s) => s.playback.state === "playing");

  // Ben loses his connection, taps "add" while offline, and gets it back later: the song is in once, never twice.
  ben.setNetwork(false);
  await expect.poll(() => ben.connected(), { timeout: 20_000, message: "Ben's phone notices it is offline" }).toBe(false);
  await ben.addSong(song("b1")).catch(() => {});
  await night.host.page.waitForTimeout(500);
  ben.setNetwork(true);
  await expect.poll(() => ben.connected(), { timeout: 30_000, message: "Ben reconnects" }).toBe(true);
  const s1 = await ben.waitForState("Ben caught up", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  expect(s1.upNext.filter((i) => i.song.videoId === "e2e-song-b1").length).toBeLessThanOrEqual(1);

  // Longer offline while songs go by: on return he sees the right queue, and a countdown if one is running.
  ben.setNetwork(false);
  await expect.poll(() => ben.connected(), { timeout: 20_000 }).toBe(false);
  night.watcher.allow("C1"); // Ben is knowingly behind while offline
  await host.send({ type: "skip" });
  await host.send({ type: "update_settings", settings: { countdownSec: 3 } });
  await ana.addSong(song("a2"));
  await host.waitForState("Ana's second song is on", (s) => s.nowPlaying?.song.videoId === "e2e-song-a2" || s.nowPlaying?.song.videoId === "e2e-song-b1");
  ben.setNetwork(true);
  await expect.poll(() => ben.connected(), { timeout: 30_000 }).toBe(true);
  await expect
    .poll(async () => {
      const h = await host.state();
      const b = await ben.state();
      return !!h && !!b && h.nowPlaying?.id === b.nowPlaying?.id && h.upNext.map((i) => i.id).join() === b.upNext.map((i) => i.id).join();
    }, { timeout: 15_000, message: "Ben shows the same queue as the host after coming back" })
    .toBe(true);
  night.watcher.forbidAgain("C1");

  // Hana's connection drops (the TV is in her browser too, so it stops as well) and comes back: the party carries on.
  host.setNetwork(false);
  await expect.poll(() => host.connected(), { timeout: 20_000 }).toBe(false);
  night.watcher.allow("C1", "stuck", "C2");
  await ana.addSong(song("a3")).catch(() => {});
  host.setNetwork(true);
  await expect.poll(() => host.connected(), { timeout: 30_000 }).toBe(true);
  await host.waitForState("Hana sees the whole queue again", (s) => (s.nowPlaying ? 1 : 0) + s.upNext.length >= 1, 15_000);
});
