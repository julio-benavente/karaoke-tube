import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";

// The countdown must be right on every screen the whole time (the watcher checks that on every tick: C2).
test("S02 · Countdown on every screen @core @countdown", async ({ night }) => {
  await night.startParty("Hana");
  const tv = await night.openTv();
  await tv.fake({ defaultDuration: 4 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const { host } = night;

  // 1. A long countdown, started by a real search-and-tap on Ana's phone.
  await host.send({ type: "update_settings", settings: { countdownSec: 10 } });
  await ana.addViaSearch("bohemian rhapsody", "Bohemian Rhapsody");
  const first = await host.waitForState("get ready", (s) => s.playback.state === "get_ready");
  expect(first.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(8_000);

  // 2. Changing the length mid-countdown doesn't touch the one that is running.
  await sleep(2000);
  await host.send({ type: "update_settings", settings: { countdownSec: 2 } });
  await sleep(500);
  expect((await host.state())!.playback.countdownEndsAt).toBe(first.playback.countdownEndsAt);

  // 3. Ben reloads during the countdown: his phone shows the right number straight away.
  await ben.reload();
  await expect.poll(async () => (await ben.countdowns()).length, { message: "Ben's phone shows the countdown after a reload" }).toBeGreaterThan(0);
  const [n] = await ben.countdowns();
  expect(n).toBeLessThanOrEqual(8);

  // The song plays, then ends.
  await host.waitForState("playing", (s) => s.playback.state === "playing", 20_000);
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);

  // 4. The next song uses the new, 2-second length.
  await ben.addSong("uptown");
  const second = await host.waitForState("second countdown", (s) => s.playback.state === "get_ready");
  expect(second.playback.countdownEndsAt! - Date.now()).toBeLessThanOrEqual(2_100);
  await host.waitForState("idle", (s) => s.playback.state === "idle" && !s.nowPlaying, 20_000);

  // 5. Countdown 0: straight to play, no get-ready card at all.
  await host.send({ type: "update_settings", settings: { countdownSec: 0 } });
  await ana.addSong("hello");
  const direct = await host.waitForState("song started", (s) => !!s.nowPlaying);
  expect(direct.playback.state).toBe("playing");
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);

  // 6. Get-ready card off, then on again.
  await host.send({ type: "update_settings", settings: { countdownSec: 2, getReadyCard: false } });
  await ben.addSong("titanium");
  expect((await host.waitForState("song started", (s) => !!s.nowPlaying)).playback.state).toBe("playing");
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);
  await host.send({ type: "update_settings", settings: { getReadyCard: true } });
  await ana.addSong("takeOnMe");
  await host.waitForState("get ready is back", (s) => s.playback.state === "get_ready");
  await host.waitForState("idle", (s) => s.playback.state === "idle", 20_000);
});
