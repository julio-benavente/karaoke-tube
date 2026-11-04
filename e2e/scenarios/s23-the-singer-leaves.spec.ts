import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S23 · The singer leaves @leaving @countdown", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 3, songSec: 60 });
  const [ana, ben, cleo, dev, eli] = await Promise.all(["Ana", "Ben", "Cleo", "Dev", "Eli"].map((n) => night.join(n)));
  const [anaId, eliId] = await Promise.all([ana.memberId(), eli.memberId()]);

  await ben.addSong(song("b1"));
  await host.waitForState("Ben is singing", (s) => s.nowPlaying?.song.videoId === "e2e-song-b1" && s.playback.state === "playing");
  await cleo.addSong(song("c1"));
  await dev.addSong(song("d1"));
  await host.waitForState("queued", (s) => s.upNext.length === 2);

  // 1. The singer leaves mid-song: the song is skipped and the next singer gets a full countdown on the TV.
  await ben.send({ type: "leave" });
  const s1 = await host.waitForState("Cleo up", (s) => s.nowPlaying?.song.videoId === "e2e-song-c1" && s.playback.state === "get_ready");
  expect(s1.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(1_500);
  await expect.poll(() => tv!.countdowns().then((c) => c.length)).toBeGreaterThan(0);

  // 2. Cleo leaves during her own countdown: Dev's song takes over with a fresh full countdown; nothing is left over.
  await cleo.send({ type: "leave" });
  const s2 = await host.waitForState("Dev up", (s) => s.nowPlaying?.song.videoId === "e2e-song-d1" && s.playback.state === "get_ready");
  expect(s2.playback.countdownEndsAt).not.toBe(s1.playback.countdownEndsAt);
  expect(s2.playback.countdownEndsAt! - Date.now()).toBeGreaterThan(1_500);
  await host.waitForState("Dev plays", (s) => s.playback.state === "playing");

  // 3. Only the last one is left: when Dev leaves, the room goes idle and the TV shows no countdown.
  await dev.send({ type: "leave" });
  await host.waitForState("idle", (s) => s.playback.state === "idle" && !s.nowPlaying);
  await expect.poll(() => tv!.countdowns()).toEqual([]);

  // 4. A duet: when one partner leaves mid-song the song goes on for the other.
  await ana.addSong(song("duet"), { singerIds: [anaId, eliId] });
  await host.waitForState("duet playing", (s) => s.nowPlaying?.song.videoId === "e2e-song-duet" && s.playback.state === "playing");
  await eli.send({ type: "leave" });
  const s4 = await host.waitForState("Eli is gone", (s) => !s.members.some((m) => m.id === eliId));
  expect(s4.nowPlaying?.song.videoId).toBe("e2e-song-duet");
  expect(s4.nowPlaying?.singerIds).toContain(anaId); // (Eli stays on the record of who started it)
  expect(s4.playback.state).toBe("playing");
});
