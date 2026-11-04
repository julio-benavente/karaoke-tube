import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S17 · Kicked @host", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 2, songSec: 8, settings: { tvBarSize: "small" } });
  const ana = await night.join("Ana");
  const dev = await night.join("Dev");
  const cleo = await night.join("Cleo");
  const [devId, cleoId] = await Promise.all([dev.memberId(), cleo.memberId()]);

  // Dev is singing; he has another song waiting, and so do Ana and Cleo.
  await dev.addSong(song("d1"));
  await host.waitForState("Dev's song", (s) => s.nowPlaying?.song.videoId === "e2e-song-d1");
  await dev.addSong(song("d2"));
  await ana.addSong(song("a1"));
  await cleo.addSong(song("c1"));
  await host.waitForState("queue", (s) => s.upNext.length === 3);

  // Kick Dev mid-song: his song is skipped, the next singer gets a fresh countdown, his phone says he was removed.
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await host.send({ type: "kick", memberId: devId });
  const after = await host.waitForState("next singer", (s) => s.nowPlaying?.song.videoId !== "e2e-song-d1" && !!s.nowPlaying);
  expect(after.members.some((m) => m.id === devId)).toBe(false);
  expect(after.upNext.some((i) => i.singerIds.includes(devId))).toBe(false);
  expect(after.nowPlaying!.song.videoId).toBe("e2e-song-a1");
  await expect(dev.page.getByText("You were removed from the party")).toBeVisible();

  // There is no per-device block yet, so Dev can join again from the same browser. If that changes this should be updated.
  await dev.page.goto(`/join/${night.code}`);
  await dev.page.getByLabel("Nickname").fill("Dev");
  await dev.page.getByRole("button", { name: "Join", exact: true }).click();
  await dev.page.waitForURL(new RegExp(`/r/${night.code}`));
  await host.waitForState("Dev is back as a new member", (s) => s.members.some((m) => m.nickname.startsWith("Dev") && m.id !== devId));

  // A kick while an award prompt is open on the other phones causes no errors (the watcher checks the screens).
  await host.waitForState("award window", (s) => !!s.awardWindow, 30_000);
  await host.send({ type: "kick", memberId: cleoId });
  await host.waitForState("Cleo gone", (s) => !s.members.some((m) => m.id === cleoId));
  await expect(cleo.page.getByText("You were removed from the party")).toBeVisible();
  expect(await ana.expectRefused({ type: "kick", memberId: devId })).toBe("not_allowed");
  void tv;
});
