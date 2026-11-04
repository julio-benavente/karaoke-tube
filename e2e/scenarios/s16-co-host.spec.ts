import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S16 · Co-host @host", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const benId = await ben.memberId();
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);

  // Hana makes Ben a co-host: his phone gets the toast, and the role shows everywhere.
  await host.send({ type: "set_role", memberId: benId, role: "cohost" });
  await ana.waitForState("Ben is co-host", (s) => s.members.find((m) => m.id === benId)?.role === "cohost");
  await expect(ben.page.getByText("You're now a co-host.")).toBeVisible();

  // Ben acts as a host: adds past the limit, moves a song, changes the mode, skips.
  for (const n of ["b1", "b2", "b3", "b4", "b5"]) await ben.addSong(song(n));
  await ana.addSong(song("a1"));
  const s = await host.waitForState("six waiting", (st) => st.upNext.length === 6);
  expect(await ben.errors()).toEqual([]);
  const a1 = s.upNext.find((i) => i.song.videoId === "e2e-song-a1")!;
  await ben.send({ type: "move_song", itemId: a1.id, toIndex: 0 });
  await host.waitForState("Ben moved a1", (st) => order(st)[0] === "Ana:song-a1");
  await ben.send({ type: "update_settings", settings: { queueMode: "fifo" } });
  await host.waitForState("Ben changed the mode", (st) => st.settings.queueMode === "fifo");

  // But he can't end the party or change roles.
  expect(await ben.expectRefused({ type: "end_party" })).toBe("not_allowed");
  expect(await ben.expectRefused({ type: "set_role", memberId: await ana.memberId(), role: "cohost" })).toBe("not_allowed");

  // Demoted: the host powers are gone at once.
  await host.send({ type: "set_role", memberId: benId, role: "guest" });
  await ben.waitForState("Ben is a guest again", (st) => st.members.find((m) => m.id === benId)?.role === "guest");
  expect(await ben.expectRefused({ type: "skip" })).toBe("not_allowed");

  // A co-host who drops for a moment is still a co-host.
  await host.send({ type: "set_role", memberId: benId, role: "cohost" });
  await ben.waitForState("co-host again", (st) => st.members.find((m) => m.id === benId)?.role === "cohost");
  await ben.reopen();
  await expect.poll(() => ben.connected(), { timeout: 15_000 }).toBe(true);
  expect((await ben.waitForState("Ben back", (st) => st.members.some((m) => m.id === benId && m.connected))).members.find((m) => m.id === benId)!.role).toBe("cohost");
});
