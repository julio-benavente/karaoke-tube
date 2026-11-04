import { test, expect } from "../lib/night";
import { order } from "../lib/people";
import { song } from "../lib/songs";

test("S10 · Duet night @songs", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 4, songSec: 4, settings: { tvLayout: "bar", tvBarSize: "small" } });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");
  const cleo = await night.join("Cleo");
  const dev = await night.join("Dev");
  const [anaId, benId, cleoId, devId] = await Promise.all([ana, ben, cleo, dev].map((p) => p.memberId()));

  // Ana and Ben sing together: the get-ready card names both, and both phones show the countdown.
  await ana.addSong(song("duet1"), { singerIds: [anaId, benId] });
  const s0 = await host.waitForState("duet get ready", (s) => s.playback.state === "get_ready");
  expect(s0.nowPlaying!.singerIds.sort()).toEqual([anaId, benId].sort());
  await expect.poll(async () => (await tv!.deepText()).includes("Ana") && (await tv!.deepText()).includes("Ben")).toBe(true);

  // While it plays: a duet is a turn for both singers, so Cleo's solo goes before Ben's and Ana's second songs.
  await cleo.addSong(song("c1"));
  await ben.addSong(song("b1"));
  await ana.addSong(song("a2"));
  await dev.addSong(song("cd"), { singerIds: [cleoId, devId] });
  const s1 = await host.waitForState("queue built", (s) => s.upNext.length === 4);
  const names = order(s1);
  expect(names.indexOf("Cleo:song-c1")).toBe(0);
  expect(names.indexOf("Cleo:song-c1")).toBeLessThan(names.indexOf("Ben:song-b1"));
  expect(names.indexOf("Cleo:song-c1")).toBeLessThan(names.indexOf("Ana:song-a2"));

  // Dev leaves before the Cleo+Dev duet plays: the song stays, for Cleo alone.
  await dev.send({ type: "leave" });
  const s2 = await host.waitForState("Dev gone", (s) => !s.members.some((m) => m.id === devId));
  const cd = s2.upNext.find((i) => i.song.videoId === "e2e-song-cd");
  expect(cd?.singerIds).toEqual([cleoId]);

  // Duets off: the room refuses a duet from a guest.
  await host.send({ type: "update_settings", settings: { duets: false } });
  await host.waitForState("duets off", (s) => !s.settings.duets);
  expect(await ben.expectRefused({ type: "add_song", song: song("nope"), singerIds: [benId, cleoId] })).toBe("not_allowed");
  await host.send({ type: "update_settings", settings: { duets: true } });
});
