import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";

// The first song is added before anyone has opened the TV page. The countdown must not end up frozen on screen.
test("S03 · The TV isn't ready yet @core @countdown @tv", async ({ night }) => {
  await night.startParty("Hana");
  const ana = await night.join("Ana");
  const { host } = night;
  await host.send({ type: "update_settings", settings: { countdownSec: 3 } });

  // 1. A song with no TV at all. The room stays in "get ready" until a TV says the song started, so what matters
  //    is that nobody is left looking at a frozen counter: after the countdown the phones must say they are waiting.
  night.watcher.allow("stuck");
  await ana.addSong("bohemian");
  await host.waitForState("get ready", (s) => s.playback.state === "get_ready");
  await sleep(3500 + 4500); // the countdown, then the time the room should have needed to say something sensible
  const stuck = (await host.state())!;
  // What a person sees on Ana's phone after the countdown is over:
  const phoneText = (await ana.bodyText()).replace(/\s+/g, " ");
  // Either the room left "get ready", or the phone says plainly that it is waiting for the TV.
  const waitingMessage = /waiting for the tv/i.test(phoneText);
  expect(stuck.playback.state !== "get_ready" || waitingMessage, `after the countdown the room is still "get ready" and Ana's phone says: ${phoneText.slice(0, 200)}`).toBe(true);
  expect(await ana.countdowns(), "no frozen number on the phone").toEqual([]);
  expect(await host.countdowns(), "no frozen number on the host").toEqual([]);

  // 2. The TV opens but nobody presses Start (the browser needs a click to play).
  const tv = await night.openTv({ press: false });
  await tv.fake({ defaultDuration: 4, durations: { "e2e-bohemian": 30 } });
  await sleep(1500);
  expect((await tv.player()).video).toBeNull();

  // 3. Start is pressed: the song begins from the start and everyone leaves "get ready".
  await tv.pressStart();
  await host.waitForState("playing", (s) => s.playback.state === "playing", 15_000);
  expect((await tv.loads())[0]).toBe("e2e-bohemian");
  night.watcher.forbidAgain("stuck");

  // 4. A second song waits for the first; its countdown only starts after the first ends.
  await ana.addSong("uptown");
  await host.waitForState("the second song waits", (s) => s.upNext.length === 1 && s.nowPlaying?.song.videoId === "e2e-bohemian");
  await host.send({ type: "skip" }); // (the first song is long; skip it to get to the second one)
  const second = await host.waitForState("second countdown", (s) => s.playback.state === "get_ready" && s.nowPlaying?.song.videoId === "e2e-uptown", 15_000);
  expect(second.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(1_500);
  await host.waitForState("second song plays", (s) => s.playback.state === "playing" && s.nowPlaying?.song.videoId === "e2e-uptown", 15_000);
});
