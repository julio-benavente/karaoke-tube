import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S31 · The TV window closes mid-song @tv @countdown", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 3, songSec: 120 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  await ana.addSong(song("a1"));
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await expect.poll(async () => (await tv!.player()).pos, { timeout: 10_000 }).toBeGreaterThan(4);

  // 1. The TV window closes: the host is told there's no TV, phones keep showing the song, songs added meanwhile wait.
  night.watcher.allow("C1");
  await tv!.goOffline();
  night.tv = null;
  await host.waitForState("no player", (s) => s.playerConnected === false);
  await expect(host.page.getByText(/No TV screen connected|paired TV isn't connected/).first()).toBeVisible();
  await ben.addSong(song("b1"));
  await host.waitForState("Ben waits", (s) => s.upNext.length === 1 && s.nowPlaying?.song.videoId === "e2e-song-a1");
  expect((await ana.state())!.nowPlaying?.song.videoId).toBe("e2e-song-a1");

  // 2. The TV window opens again, presses Start, and the same song resumes about where it should be.
  const gone = Date.now();
  const tv2 = await night.openTv();
  await tv2.fake({ defaultDuration: 120 });
  await expect.poll(async () => (await tv2.player()).video, { timeout: 15_000 }).toBe("e2e-song-a1");
  const shouldBeAt = ((await host.state())!.playback.positionSec ?? 0) + (Date.now() - gone) / 1000;
  const at = (await tv2.player()).pos;
  expect(at, "the song resumes near where it was").toBeGreaterThan(Math.min(4, shouldBeAt - 12));
  night.watcher.forbidAgain("C1");
  expect((await host.state())!.playerConnected).toBe(true);

  // 3. The TV closes during a countdown and comes back after it ended: the song starts, no frozen counter.
  await host.send({ type: "skip" });
  await host.waitForState("Ben's countdown", (s) => s.playback.state === "get_ready");
  night.watcher.allow("C1", "stuck", "noCountdown");
  await tv2.goOffline();
  night.tv = null;
  await host.waitForState("no player again", (s) => s.playerConnected === false);
  await host.page.waitForTimeout(4000); // the countdown (3 s) is over
  const tv3 = await night.openTv();
  await tv3.fake({ defaultDuration: 6 });
  await host.waitForState("Ben's song plays", (s) => s.playback.state === "playing" && s.nowPlaying?.song.videoId === "e2e-song-b1", 15_000);
  night.watcher.forbidAgain("C1", "stuck", "noCountdown");
  await expect.poll(() => host.countdowns()).toEqual([]);
});

test("S31c · A second TV window takes over and the first one says so @tv", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 1, songSec: 120 });
  const first = tv!;
  // Opening another TV window for the same party: the newest one plays, the older one tells you instead of sitting idle.
  const second = await night.openTv();
  await expect(first.page.getByTestId("tv-replaced")).toBeVisible();
  await expect(second.page.getByTestId("tv-replaced")).toHaveCount(0);
  await host.waitForState("one player", (s) => s.playerConnected === true);

  // "Use this window" takes it back, and now the other one is told.
  await first.page.getByRole("button", { name: "Use this window" }).click();
  await first.pressStart();
  await expect(second.page.getByTestId("tv-replaced")).toBeVisible();
});
