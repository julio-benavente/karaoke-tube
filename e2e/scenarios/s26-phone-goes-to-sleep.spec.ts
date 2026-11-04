import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S26 · A guest's phone goes to sleep @leaving", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 2, songSec: 6 });
  const ana = await night.join("Ana");
  const cleo = await night.join("Cleo");
  const cleoId = await cleo.memberId();
  await tv!.fake({ durations: { "e2e-song-a1": 90 } });
  await ana.addSong(song("a1"));
  await host.waitForState("Ana is singing", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  await cleo.addSong(song("c1"));
  await cleo.addSong(song("c2"));
  await host.waitForState("Cleo's songs queued", (s) => s.upNext.length === 2);

  // Cleo's phone goes away: Hana sees her "Offline" in the host app, and her songs are still waiting (no auto-skip).
  night.watcher.allow("C1");
  await cleo.goOffline();
  await host.waitForState("Cleo offline", (s) => s.members.find((m) => m.id === cleoId)?.connected === false);
  await expect(host.page.getByText("Offline").first()).toBeVisible();
  expect((await host.state())!.upNext).toHaveLength(2);

  // Hana clears all of Cleo's songs: the queue updates everywhere.
  await host.send({ type: "remove_member_songs", memberId: cleoId });
  await host.waitForState("Cleo's songs gone", (s) => s.upNext.length === 0);
  await ana.waitForState("Ana sees the same", (s) => s.upNext.length === 0);
  expect(order((await host.state())!)).toEqual([]);

  // Cleo wakes up mid-song: she is back as the same person, sees the right screen at once, and can add a song.
  await cleo.comeBack();
  await expect.poll(() => cleo.connected(), { timeout: 15_000 }).toBe(true);
  const back = await cleo.waitForState("Cleo sees the party", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  expect(back.members.find((m) => m.id === cleoId)?.connected).toBe(true);
  night.watcher.forbidAgain("C1");
  await cleo.addSong(song("c3"));
  await host.waitForState("c3 queued", (s) => s.upNext.length === 1);
});
