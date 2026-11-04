import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S20 · Host edits the queue @host", async ({ night }) => {
  const { host } = await night.setup({ tv: false, settings: { queueMode: "fifo", maxWaitingPerMember: 3 } });
  const [ana, ben, cleo] = await Promise.all(["Ana", "Ben", "Cleo"].map((n) => night.join(n)));
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);

  for (const [p, n] of [[ana, "a1"], [ben, "b1"], [cleo, "c1"], [ana, "a2"], [ben, "b2"], [cleo, "c2"]] as const) {
    await p.addSong(song(n));
    await host.waitForState(`${n} queued`, (s) => s.upNext.some((i) => i.song.videoId === `e2e-song-${n}`));
  }
  const q = () => host.state().then((s) => s!);
  const idOf = async (n: string) => (await q()).upNext.find((i) => i.song.videoId === `e2e-song-${n}`)!.id;

  // The last song to the top, one down, "play next" on another, remove two.
  await host.send({ type: "move_song", itemId: await idOf("c2"), toIndex: 0 });
  await host.waitForState("c2 first", (s) => order(s)[0] === "Cleo:song-c2");
  await host.send({ type: "move_song", itemId: await idOf("a1"), toIndex: 3 });
  await host.send({ type: "move_song", itemId: await idOf("b2"), toIndex: 0 });
  await host.send({ type: "remove_song", itemId: await idOf("c1") });
  await host.send({ type: "remove_song", itemId: await idOf("a2") });
  const mine = await host.waitForState("edited", (s) => s.upNext.length === 4);
  // Every phone shows the new order (the watcher also compares them all the time).
  for (const p of [ana, ben, cleo]) await p.waitForState("same order", (s) => order(s).join() === order(mine).join());
  expect(order(mine)).toContain("Ben:song-b2");
  expect(order(mine)[0]).toBe("Ben:song-b2");

  // Owners see their own song gone; a guest removes their own, but not someone else's.
  expect(mine.upNext.some((i) => i.song.videoId === "e2e-song-c1")).toBe(false);
  const b1 = mine.upNext.find((i) => i.song.videoId === "e2e-song-b1")!;
  expect(await ana.expectRefused({ type: "remove_song", itemId: b1.id })).toBe("not_allowed");
  await ben.send({ type: "remove_song", itemId: b1.id });
  await host.waitForState("Ben removed his own", (s) => !s.upNext.some((i) => i.id === b1.id));

  // Skipping the song in get-ready brings the next one up.
  const before = (await q()).upNext[0].id;
  await host.send({ type: "skip" });
  await host.waitForState("next song up", (s) => s.nowPlaying?.id === before);
});
