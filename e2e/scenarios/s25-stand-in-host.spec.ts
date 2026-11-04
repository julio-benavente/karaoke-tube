import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

// The host-offline timer is 3 s here (E2E_FAST); in the real app it is 60 s.
test("S25 · The host's laptop sleeps @leaving @host", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana"); // in the room the longest
  const ben = await night.join("Ben");
  const [anaId, benId] = await Promise.all([ana.memberId(), ben.memberId()]);
  await host.send({ type: "set_role", memberId: benId, role: "cohost" });
  await ana.waitForState("Ben is co-host", (s) => s.members.find((m) => m.id === benId)?.role === "cohost");
  await host.addSong(song("h1"));
  await host.addSong(song("h2"));
  await host.waitForState("queued", (s) => !!s.nowPlaying && s.upNext.length === 1);
  night.watcher.allow("C1"); // while Hana's screen is closed there is nothing of hers to compare

  // 1. Hana's tab closes. Everyone sees her "Offline"; after the timer the co-host stands in.
  await host.goOffline();
  await ana.waitForState("Hana offline", (s) => s.members.find((m) => m.nickname === "Hana")?.connected === false);
  const s1 = await ana.waitForState("Ben stands in", (s) => s.tempHostId === benId, 20_000);
  expect(s1.members.find((m) => m.id === benId)!.role).toBe("host");
  expect(s1.members.find((m) => m.nickname === "Hana")!.role).toBe("cohost");
  await expect(ben.page.getByText("You're the temporary host while the host is away.")).toBeVisible();
  // Ben can run the party; Ana still can't.
  await ben.send({ type: "skip" });
  await ana.waitForState("Ben skipped", (s) => s.nowPlaying?.song.videoId === "e2e-song-h2");
  expect(await ana.expectRefused({ type: "skip" })).toBe("not_allowed");

  // 2. Hana returns: she is the host again, Ben is a co-host again.
  await host.comeBack(`/host/${night.code}`);
  const s2 = await ana.waitForState("Hana is back", (s) => !s.tempHostId && s.members.find((m) => m.nickname === "Hana")?.role === "host", 20_000);
  expect(s2.members.find((m) => m.id === benId)!.role).toBe("cohost");
  await expect(ben.page.getByText("Hana is back as host.")).toBeVisible(); // told to the one who stood in
  night.watcher.forbidAgain("C1");

  // 3. With no co-host, the guest who has been there longest stands in, and is a guest again afterwards.
  await host.send({ type: "set_role", memberId: benId, role: "guest" });
  await ben.waitForState("Ben is a guest", (s) => s.members.find((m) => m.id === benId)?.role === "guest");
  night.watcher.allow("C1");
  await host.goOffline();
  const s3 = await ben.waitForState("Ana stands in", (s) => s.tempHostId === anaId, 20_000);
  expect(s3.members.find((m) => m.id === anaId)!.role).toBe("host");
  await host.comeBack(`/host/${night.code}`);
  const s4 = await ben.waitForState("Hana is back again", (s) => !s.tempHostId && s.members.find((m) => m.nickname === "Hana")?.role === "host", 20_000);
  expect(s4.members.find((m) => m.id === anaId)!.role).toBe("guest");
  night.watcher.forbidAgain("C1");
});
