import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S08 · Switch queue mode mid-night @queue", async ({ night }) => {
  const { host } = await night.setup({ tv: false, settings: { maxWaitingPerMember: 3 } });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);

  for (const n of ["a1", "a2", "a3"]) await ana.addSong(song(n));
  await ben.addSong(song("b1"));
  expect(order(await host.waitForState("four waiting", (s) => s.upNext.length === 4))).toEqual(["Ana:song-a1", "Ben:song-b1", "Ana:song-a2", "Ana:song-a3"]);

  // First come, first served: Ana's three, then Ben's. Phones follow without a refresh.
  await host.send({ type: "update_settings", settings: { queueMode: "fifo" } });
  expect(order(await ben.waitForState("fifo order", (s) => s.settings.queueMode === "fifo"))).toEqual(["Ana:song-a1", "Ana:song-a2", "Ana:song-a3", "Ben:song-b1"]);

  // Hana drags Ben's song to the top, then goes back to rotation: it stays where she put it.
  const b1 = (await host.state())!.upNext.find((i) => i.song.videoId === "e2e-song-b1")!;
  await host.send({ type: "move_song", itemId: b1.id, toIndex: 0 });
  await host.waitForState("b1 on top", (s) => order(s)[0] === "Ben:song-b1");
  await host.send({ type: "update_settings", settings: { queueMode: "rotation" } });
  await host.waitForState("rotation", (s) => s.settings.queueMode === "rotation");
  expect(order((await host.state())!)).toEqual(["Ben:song-b1", "Ana:song-a1", "Ana:song-a2", "Ana:song-a3"]);

  // "Play next" on Ana's second song: it jumps to the top, the rest keep their order.
  const a2 = (await host.state())!.upNext.find((i) => i.song.videoId === "e2e-song-a2")!;
  await host.send({ type: "move_song", itemId: a2.id, toIndex: 0 });
  await host.waitForState("a2 on top", (s) => order(s)[0] === "Ana:song-a2");
  expect(order((await ben.state())!)).toEqual(["Ana:song-a2", "Ben:song-b1", "Ana:song-a1", "Ana:song-a3"]);

  // A guest can't change the mode or move songs.
  expect(await ben.expectRefused({ type: "update_settings", settings: { queueMode: "fifo" } })).toBe("not_allowed");
  expect(await ben.expectRefused({ type: "move_song", itemId: a2.id, toIndex: 3 })).toBe("not_allowed");
});
