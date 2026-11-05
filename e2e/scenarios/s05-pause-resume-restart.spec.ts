import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";

test("S05 · Pause, resume, restart @core", async ({ night }) => {
  await night.startParty("Hana");
  const tv = await night.openTv();
  await tv.fake({ defaultDuration: 120 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const { host } = night;
  await host.send({ type: "update_settings", settings: { countdownSec: 1 } });

  await ana.addSong("bohemian");
  await ben.addSong("uptown");
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await expect.poll(async () => (await tv.player()).pos, { timeout: 8000 }).toBeGreaterThan(3);

  // 1. Pause: everyone sees it, and the position stops.
  await host.send({ type: "pause" });
  await host.waitForState("paused", (s) => s.playback.state === "paused");
  await ana.waitForState("paused on Ana's phone", (s) => s.playback.state === "paused");
  const atPause = (await tv.player()).pos;
  await sleep(2500);
  const frozen = await tv.player();
  expect(frozen.state).toBe(2);
  expect(Math.abs(frozen.pos - atPause)).toBeLessThan(0.3);
  const posAtPause = (await host.state())!.playback.positionSec;
  expect(posAtPause).toBeGreaterThan(2);

  // 2. Resume: continues from the same place, not from 0 and not 2.5 s further on.
  const resumedAt = Date.now();
  await host.send({ type: "resume" });
  await host.waitForState("playing again", (s) => s.playback.state === "playing");
  await sleep(800);
  const resumed = await tv.player();
  const elapsed = (Date.now() - resumedAt) / 1000; // a busy machine can make this much longer than 0.8 s
  expect(resumed.state).toBe(1);
  expect(resumed.pos).toBeGreaterThan(atPause);
  expect(resumed.pos).toBeLessThan(atPause + elapsed + 1);

  // 3. Restart: back to the start, still the same song, still playing.
  const itemId = (await host.state())!.nowPlaying!.id;
  const beforeRestart = (await host.state())!.playback.positionSec;
  night.watcher.allow("C8"); // a restart is the one way the position goes back
  await host.send({ type: "restart" });
  await expect.poll(async () => (await tv.player()).pos, { timeout: 5000 }).toBeLessThan(2.5);
  // Every screen has to have caught up with the restart before a position that went back counts as wrong again.
  for (const who of [host, ana, ben, tv]) await who.waitForState("restart seen", (s) => s.playback.positionSec < beforeRestart - 0.3);
  night.watcher.forbidAgain("C8");
  const afterRestart = (await host.state())!;
  expect(afterRestart.nowPlaying?.id).toBe(itemId);
  expect(afterRestart.playback.state).toBe("playing");

  // 4. Let the song get past the first few seconds (a TV reopened before that starts the song over), then pause and refresh the TV: it comes back paused at the same place.
  await expect.poll(async () => (await tv.player()).pos, { timeout: 10_000 }).toBeGreaterThan(4);
  await host.send({ type: "pause" });
  await host.waitForState("paused", (s) => s.playback.state === "paused");
  const pausedAt = (await host.state())!.playback.positionSec;
  await tv.reload();
  await tv.fake({ defaultDuration: 120 }); // a reloaded page forgets the fake's settings
  await tv.pressStart();
  await expect.poll(async () => (await tv.player()).video, { timeout: 10_000 }).toBe("e2e-bohemian");
  await expect.poll(async () => (await tv.player()).state, { timeout: 10_000, message: "TV is paused after the refresh" }).toBe(2);
  expect((await host.state())!.playback.state).toBe("paused");
  expect(Math.abs((await tv.player()).pos - pausedAt)).toBeLessThan(2.5);

  // 5. Resume, then pause and skip: a paused song doesn't block the queue.
  await host.send({ type: "resume" });
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await host.send({ type: "pause" });
  await host.waitForState("paused", (s) => s.playback.state === "paused");
  await host.send({ type: "skip" });
  const next = await host.waitForState("Ben's song", (s) => s.nowPlaying?.song.videoId === "e2e-uptown" && ["get_ready", "playing"].includes(s.playback.state));
  expect(next.playback.state).not.toBe("paused");
  await host.waitForState("Ben's song plays", (s) => s.playback.state === "playing");
});
