import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S06 · Two friends, fair rotation @queue @i18n", async ({ night }) => {
  // No TV: the first song stays in "get ready", so the queue order is easy to read.
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana", { lang: "es" });
  const ben = await night.join("Ben", { lang: "es" });

  await host.addSong(song("blocker"));
  await host.waitForState("blocker in get ready", (s) => s.nowPlaying?.song.videoId === "e2e-song-blocker");

  // Ana's third song is refused (limit 2); nothing changes for anyone.
  await ana.addSong(song("a1"));
  await ana.addSong(song("a2"));
  expect(await ana.expectRefused({ type: "add_song", song: song("a3") })).toBe("queue_limit");
  await ben.addSong(song("b1"));
  const s1 = await host.waitForState("three waiting", (s) => s.upNext.length === 3);
  expect(order(s1)).toEqual(["Ana:song-a1", "Ben:song-b1", "Ana:song-a2"]);
  expect(await ben.errors()).toEqual([]);

  await ben.addSong(song("b2"));
  expect(order(await host.waitForState("four waiting", (s) => s.upNext.length === 4))).toEqual(["Ana:song-a1", "Ben:song-b1", "Ana:song-a2", "Ben:song-b2"]);

  // The Spanish phone shows its own queue in Spanish, with no English leftovers.
  const text = await ana.bodyText();
  expect(text).not.toMatch(/Add to queue|Now singing|Next up/);

  // When the blocker is skipped, Ana's first song starts and frees a slot: her new song goes to the end of round 3.
  await host.send({ type: "skip" });
  await host.waitForState("Ana's song is up", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  await ana.addSong(song("a3"));
  const s2 = await host.waitForState("a3 queued", (s) => s.upNext.length === 4);
  expect(order(s2)).toEqual(["Ben:song-b1", "Ana:song-a2", "Ben:song-b2", "Ana:song-a3"]);

  // The host is not held to the limit.
  for (const n of ["h1", "h2", "h3", "h4"]) await host.addSong(song(n));
  await host.waitForState("host songs queued", (s) => s.upNext.length === 8);
  expect(await host.errors()).toEqual([]);
});
