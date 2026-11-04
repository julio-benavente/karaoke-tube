import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S32 · A video that can't play @tv @songs", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 1, songSec: 4 });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  await tv!.fake({ failing: { "e2e-song-bad1": true, "e2e-song-bad2": true, "e2e-song-bad3": true } });

  // 1. A song that fails: the singer and the host are told, it is skipped, and the next singer's countdown starts normally.
  await ana.addSong(song("bad1"));
  await ben.addSong(song("b1"));
  await expect.poll(() => ana.errors(), { timeout: 20_000 }).toContain("song_unplayable");
  await expect.poll(() => host.errors()).toContain("song_unplayable");
  expect(await ben.errors()).toEqual([]);
  await host.waitForState("Ben's song gets going", (s) => s.nowPlaying?.song.videoId === "e2e-song-b1", 15_000);
  await host.waitForState("Ben's song plays", (s) => s.playback.state === "playing", 15_000);
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);

  // 2. Several in a row: each is skipped, no loop and no stuck "get ready".
  await ana.addSong(song("bad2"));
  await ben.addSong(song("bad3"));
  await ana.addSong(song("a2"));
  await host.waitForState("a2 plays after two failures", (s) => s.nowPlaying?.song.videoId === "e2e-song-a2" && s.playback.state === "playing", 30_000);
  await host.waitForState("idle", (s) => s.playback.state === "idle", 15_000);

  // 3. A video whose length isn't known (0) gets its real length from the player.
  await ben.addSong({ ...song("unknown"), durationSec: 0 });
  const s = await host.waitForState("unknown-length song plays", (st) => st.nowPlaying?.song.videoId === "e2e-song-unknown" && st.playback.state === "playing", 15_000);
  await host.waitForState("length filled in", (st) => (st.nowPlaying?.song.durationSec ?? 0) > 0, 10_000);
  void s;
});

test("S32b · A video that never starts is skipped @tv @songs", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 1, songSec: 4 });
  const ana = await night.join("Ana");
  await tv!.fake({ stuck: { "e2e-song-frozen": true } });
  await ana.addSong(song("frozen"));
  await ana.addSong(song("fine"));
  night.watcher.allow("stuck"); // up to the TV's own 15 s start timeout
  await host.waitForState("frozen is skipped and the next one plays", (s) => s.nowPlaying?.song.videoId === "e2e-song-fine" && s.playback.state === "playing", 40_000);
  night.watcher.forbidAgain("stuck");
  await expect.poll(() => ana.errors()).toContain("song_unplayable");
});
