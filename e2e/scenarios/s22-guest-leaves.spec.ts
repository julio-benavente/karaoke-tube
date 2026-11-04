import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S22 · A guest leaves with songs waiting @leaving", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const [ana, ben, cleo] = await Promise.all(["Ana", "Ben", "Cleo"].map((n) => night.join(n)));
  const oldAnaId = await ana.memberId();
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);
  await ana.addSong(song("a1"));
  await ana.addSong(song("a2"));
  await ben.addSong(song("b1"));
  await cleo.addSong(song("c1"));
  await host.waitForState("four waiting", (s) => s.upNext.length === 4);

  // Ana leaves through the real Leave button: her songs go from every phone, and her phone leaves the party.
  await ana.leaveViaUI();
  const after = await host.waitForState("Ana is gone", (s) => !s.members.some((m) => m.id === oldAnaId));
  expect(order(after)).toEqual(["Ben:song-b1", "Cleo:song-c1"]);
  await ben.waitForState("Ben sees it too", (s) => s.upNext.length === 2);
  await expect(ana.page).not.toHaveURL(new RegExp(`/r/${night.code}`));

  // She joins again with the code: a new member with no songs, treated as new in the rotation.
  const back = await night.join("Ana");
  const newId = await back.memberId();
  expect(newId).not.toBe(oldAnaId);
  await back.addSong(song("a3"));
  expect(order(await host.waitForState("a3 queued", (s) => s.upNext.length === 3))).toEqual(["Ben:song-b1", "Cleo:song-c1", "Ana:song-a3"]);

  // Her old credentials don't bring the old member back.
  await expect.poll(async () => (await host.state())!.members.filter((m) => m.nickname.startsWith("Ana")).length).toBe(1);
});
