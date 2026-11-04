import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S11 · Everyone sings @songs", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 3, songSec: 3 });
  await tv!.fake({ durations: { "e2e-song-group": 25 } });
  const guests = await Promise.all(["Ana", "Ben", "Cleo", "Dev"].map((n) => night.join(n)));
  const cleo = guests[2];

  // A group song for everyone: the TV shows "Everyone" and every phone gets the countdown.
  await cleo.addSong(song("group"), { everyone: true });
  const s0 = await host.waitForState("group get ready", (s) => s.playback.state === "get_ready");
  expect(s0.nowPlaying!.everyone).toBe(true);
  await expect.poll(async () => (await tv!.deepText()).toLowerCase()).toContain("everyone");
  // (Every phone showing the countdown is checked all the time by the watcher, rule C2.)

  // A late guest joins mid-song and sees it playing.
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  const fay = await night.join("Fay");
  await fay.waitForState("Fay sees the group song", (s) => s.nowPlaying?.song.videoId === "e2e-song-group" && s.members.length === 6);

  // The group song doesn't use a slot: Cleo can still queue two songs (limit 2) while it is on.
  await cleo.addSong(song("c1"));
  await cleo.addSong(song("c2"));
  await host.waitForState("two songs waiting", (s) => s.upNext.length === 2);
  expect(await cleo.errors()).toEqual([]);

  // Everything plays through, then the party ends and Cleo has the Choir Leader title.
  await host.waitForState("all done", (s) => s.playback.state === "idle" && !s.nowPlaying && s.upNext.length === 0, 60_000);
  await host.send({ type: "end_party" });
  const ended = await host.waitForState("ended", (s) => s.status === "ended" && !!s.recap);
  const cleoId = await cleo.memberId();
  expect(ended.recap!.titles[cleoId]).toContain("choir_leader");
});
