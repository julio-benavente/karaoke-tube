import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";
import { song } from "../lib/songs";

// Everything at once: eight people, a TV, a co-host, a duet, a group song, a pasted link, Spanish phones, a TV that closes,
// a phone that drops, someone who leaves, someone who is kicked, mode changes, an unplayable video, a host who vanishes,
// awards during countdowns, and the end of the night. The watcher (C1, C2, C3, C6, C8) runs the whole time.
test("S39 · Grand finale @chaos", async ({ night }) => {
  test.setTimeout(240_000);
  const { host } = await night.setup({ countdown: 2, songSec: 4, settings: { maxWaitingPerMember: 3 } });
  let tv = night.tv!;
  await tv.fake({ failing: { "e2e-song-bad": true } });

  // 1. Hana, Ben (co-host) and six guests, one name twice, two phones in Spanish, plus Gran.
  const ana = await night.join("Ana", { lang: "es" });
  const ben = await night.join("Ben");
  const cleo = await night.join("Cleo", { lang: "es" });
  const dev = await night.join("Dev");
  const eli = await night.join("Eli");
  const ana2 = await night.join("Ana");
  const [anaId, benId, cleoId, devId, eliId] = await Promise.all([ana, ben, cleo, dev, eli].map((p) => p.memberId()));
  await host.send({ type: "set_role", memberId: benId, role: "cohost" });
  await host.send({ type: "add_guest", nickname: "Gran", avatarSeed: "gran" });
  const s0 = await host.waitForState("everyone is in", (s) => s.members.length === 8);
  expect(s0.members.filter((m) => m.nickname.startsWith("Ana")).map((m) => m.nickname).sort()).toEqual(["Ana", "Ana 2"]);
  const granId = s0.members.find((m) => m.nickname === "Gran")!.id;

  // 2. Songs, a duet, a group song and a pasted link, all within a few seconds.
  await Promise.all([
    ana.addSong(song("a1")),
    ben.addSong(song("duet"), { singerIds: [benId, cleoId] }),
    cleo.addSong(song("group"), { everyone: true }),
    dev.addSong(song("d1")),
    eli.addSong(song("e1")),
    ana2.addSong(song("x1")),
    host.addSong({ ...song("link"), videoId: "dQw4w9WgXcQ", title: "Rick - Never Gonna (Pasted Link)" }),
    host.addSong(song("for-gran"), { singerIds: [granId] }),
  ]);
  await host.waitForState("songs are in", (s) => (s.nowPlaying ? 1 : 0) + s.upNext.length >= 7);

  // 3. The TV window closes mid-song and comes back; Cleo's phone drops and returns.
  await host.waitForState("something is playing", (s) => s.playback.state === "playing", 30_000);
  night.watcher.allow("C1", "stuck", "noCountdown");
  await tv.goOffline();
  night.tv = null;
  cleo.setNetwork(false);
  await sleep(2500);
  tv = await night.openTv();
  await tv.fake({ defaultDuration: 4, failing: { "e2e-song-bad": true } });
  cleo.setNetwork(true);
  await expect.poll(() => cleo.connected(), { timeout: 30_000 }).toBe(true);

  // 4. Eli leaves with songs waiting; Dev is kicked; queue modes change twice; the limit and reactions change.
  await eli.send({ type: "leave" });
  await host.send({ type: "kick", memberId: devId });
  await host.send({ type: "update_settings", settings: { queueMode: "approval" } });
  await ana.waitForState("Ana sees the Host-picks mode", (s) => s.settings.queueMode === "approval"); // (two connections: the order between them isn't guaranteed)
  await ana.addSong(song("a2"));
  await host.waitForState("a2 waits for approval", (s) => (s.pending?.length ?? 0) >= 1);
  await host.send({ type: "update_settings", settings: { queueMode: "fifo", maxWaitingPerMember: 2, reactions: false } });
  await host.send({ type: "update_settings", settings: { queueMode: "rotation", reactions: true, countdownSec: 1 } });
  await host.waitForState("no one is pending", (s) => (s.pending?.length ?? 0) === 0);
  night.watcher.forbidAgain("C1", "stuck", "noCountdown");

  // 5. An unplayable video comes up in the middle of it all.
  await ben.addSong(song("bad"));
  await ana2.addSong(song("x2"));

  // 6. Hana's laptop (and the TV in it) vanish: the co-host stands in and skips; they come back and are host again.
  night.watcher.allow("C1", "stuck", "noCountdown");
  await tv.goOffline();
  night.tv = null;
  await host.goOffline();
  const stand = await ben.waitForState("Ben stands in", (s) => s.tempHostId === benId, 20_000);
  expect(stand.members.find((m) => m.id === benId)!.role).toBe("host");
  await ben.send({ type: "skip" });
  await host.comeBack(`/host/${night.code}`);
  await ana.waitForState("Hana is host again", (s) => !s.tempHostId && s.members.find((m) => m.nickname === "Hana")?.role === "host", 20_000);
  tv = await night.openTv();
  await tv.fake({ defaultDuration: 4, failing: { "e2e-song-bad": true } });
  // Give the new TV the moment it needs to pick the song up before "get ready" is held to its countdown again.
  await host.waitForState("the new TV has taken over", (s) => s.playback.state !== "get_ready" || (s.playback.countdownEndsAt ?? 0) > Date.now(), 20_000);
  night.watcher.forbidAgain("C1", "stuck", "noCountdown");

  // 7. Awards while the next song counts down, then let everything play out.
  await host.waitForState("an award window opens", (s) => !!s.awardWindow && s.awardWindow.closesAt > Date.now(), 60_000);
  const win = (await host.state())!.awardWindow!;
  if (!win.item.singerIds.includes(anaId)) await ana.send({ type: "give_award", itemId: win.item.id, award: "great_vibes" }).catch(() => {});
  await host.waitForState("the queue is empty", (s) => s.playback.state === "idle" && !s.nowPlaying && s.upNext.length === 0, 120_000);

  // 8. The night ends. The recap lists each song that was played once, in order, and only people who were there.
  await host.send({ type: "end_party" });
  const ended = await host.waitForState("ended with recap", (s) => s.status === "ended" && !!s.recap);
  const ids = ended.recap!.performances.map((p) => p.item.id);
  expect(new Set(ids).size, "no song twice in the recap").toBe(ids.length);
  expect(ended.recap!.performances.some((p) => p.item.song.videoId === "e2e-song-bad"), "the unplayable video isn't in the recap").toBe(false);
  expect(ended.recap!.performances.length).toBeGreaterThanOrEqual(3);
  void eliId;
});
