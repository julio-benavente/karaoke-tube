import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S19 · Gran has no phone @host", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  // Gran is added first, so she has been in the room the longest.
  await host.send({ type: "add_guest", nickname: "Gran", avatarSeed: "gran" });
  const s0 = await host.waitForState("Gran is in", (s) => s.members.some((m) => m.nickname === "Gran"));
  const gran = s0.members.find((m) => m.nickname === "Gran")!;
  expect(gran.phoneless).toBe(true);
  expect(gran.connected).toBe(true);
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");

  // Hana adds songs as Gran; she takes her turn in the rotation like anyone.
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);
  await ana.addSong(song("a1"));
  await host.addSong(song("g1"), { singerIds: [gran.id] });
  await ben.addSong(song("b1"));
  await host.addSong(song("g2"), { singerIds: [gran.id] });
  expect(order(await host.waitForState("four waiting", (s) => s.upNext.length === 4))).toEqual(["Ana:song-a1", "Gran:song-g1", "Ben:song-b1", "Gran:song-g2"]);

  // Gran can't be a co-host or hold the mic of a phone.
  expect(await host.expectRefused({ type: "set_role", memberId: gran.id, role: "cohost" })).toBe("not_allowed");

  // The host's laptop sleeps (the timer is 3 s here): the stand-in is Ana or Ben, never Gran, and the real host gets the seat back.
  await host.page.close();
  const stand = await ana.waitForState("someone stands in as host", (s) => !!s.tempHostId, 20_000);
  expect(stand.tempHostId).not.toBe(gran.id);
  expect(stand.members.find((m) => m.id === stand.tempHostId)!.role).toBe("host");
  night.watcher.allow("C1"); // Hana's page is gone, so there is nothing to compare her screen with
  host.page = await host.ctx.newPage();
  await host.page.goto(`/host/${night.code}`);
  await ana.waitForState("Hana is host again", (s) => !s.tempHostId && s.members.find((m) => m.nickname === "Hana")?.role === "host", 20_000);

  // Removing Gran takes her songs with her.
  await host.send({ type: "kick", memberId: gran.id });
  const after = await host.waitForState("Gran is gone", (s) => !s.members.some((m) => m.id === gran.id));
  expect(after.upNext.some((i) => i.singerIds.includes(gran.id))).toBe(false);
});
