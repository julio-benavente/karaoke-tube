import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S07 · Friday five @queue @join", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);

  // Five people join at once; the second Ana becomes "Ana 2".
  const phones = await Promise.all(["Ana", "Ben", "Cleo", "Dev", "Ana"].map((n) => night.join(n)));
  const s0 = await host.waitForState("everyone is in", (s) => s.members.length === 6);
  expect(s0.members.map((m) => m.nickname).sort()).toEqual(["Ana", "Ana 2", "Ben", "Cleo", "Dev", "Hana"]);

  // Everyone adds a song in the same instant: nothing lost, nothing doubled.
  await Promise.all(phones.map((p, i) => p.addSong(song(`first-${i}`))));
  const s1 = await host.waitForState("five waiting", (s) => s.upNext.length === 5);
  expect(new Set(s1.upNext.map((i) => i.song.videoId)).size).toBe(5);

  // A second round of songs, then a late guest: Eli's first song goes ahead of every second-round song.
  await Promise.all(phones.map((p, i) => p.addSong(song(`second-${i}`))));
  await host.waitForState("ten waiting", (s) => s.upNext.length === 10);
  const eli = await night.join("Eli");
  await eli.addSong(song("eli"));
  const s2 = await host.waitForState("eli queued", (s) => s.upNext.length === 11);
  const names = order(s2);
  const eliAt = names.findIndex((n) => n.startsWith("Eli:"));
  expect(eliAt).toBe(5); // after the five first-round songs, before the five second-round ones
  expect(names.slice(0, 5).every((n) => n.includes("first-"))).toBe(true);
  expect(names.slice(6).every((n) => n.includes("second-"))).toBe(true);

  // Every phone shows the same queue (the watcher's C1 check has been running throughout).
  for (const p of [...phones, eli]) await p.waitForState("same queue", (s) => s.upNext.length === 11);
});
