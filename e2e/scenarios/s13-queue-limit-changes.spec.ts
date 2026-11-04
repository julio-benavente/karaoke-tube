import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S13 · Queue limit changes live @queue", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana");
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);

  // Limit 2, Ana at the limit: her search page says so.
  await ana.addSong(song("a1"));
  await ana.addSong(song("a2"));
  await host.waitForState("two waiting", (s) => s.upNext.length === 2);
  await ana.tab("Search");
  await expect(ana.page.getByText(/You've got 2 songs waiting, the most this party allows/)).toBeVisible();

  // Raised to 4: the message goes away at once and she can add two more.
  await host.send({ type: "update_settings", settings: { maxWaitingPerMember: 4 } });
  await expect(ana.page.getByText(/the most this party allows/)).toHaveCount(0);
  await ana.addSong(song("a3"));
  await ana.addSong(song("a4"));
  await host.waitForState("four waiting", (s) => s.upNext.length === 4);

  // Lowered to 1: she keeps what she has, can't add, and can still remove.
  await host.send({ type: "update_settings", settings: { maxWaitingPerMember: 1 } });
  await ana.waitForState("limit 1", (s) => s.settings.maxWaitingPerMember === 1);
  expect(await ana.expectRefused({ type: "add_song", song: song("a5") })).toBe("queue_limit");
  const a4 = (await ana.state())!.upNext.find((i) => i.song.videoId === "e2e-song-a4")!;
  await ana.send({ type: "remove_song", itemId: a4.id });
  await host.waitForState("a4 removed", (s) => s.upNext.length === 3);

  // Her first song starts playing (leaves her waiting count): still over the limit until she is under it.
  await host.send({ type: "skip" });
  await host.waitForState("a1 playing", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  expect(await ana.expectRefused({ type: "add_song", song: song("a6") })).toBe("queue_limit");
});
