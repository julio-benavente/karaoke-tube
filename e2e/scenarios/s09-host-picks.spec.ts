import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S09 · Host picks (approval) @queue @host", async ({ night }) => {
  const { host } = await night.setup({ settings: { queueMode: "approval", tvBarSize: "large" } });
  const ana = await night.join("Ana");
  const ben = await night.join("Ben");

  // Guests' songs wait for the host's OK and don't play.
  await ana.addSong(song("x"));
  await ben.addSong(song("y"));
  const s0 = await host.waitForState("two pending", (s) => (s.pending?.length ?? 0) === 2);
  expect(s0.nowPlaying).toBeNull();
  expect(s0.upNext).toEqual([]);
  // Ana's phone says her song is waiting for the OK; the host sees what needs approval.
  await ana.tab("Queue");
  await expect(ana.page.getByText("Waiting for the host's OK").first()).toBeVisible();
  await host.page.getByText("Waiting for your OK").first().waitFor();

  // Approve Ben's: it starts. Ana's still waits.
  const y = s0.pending!.find((i) => i.song.videoId === "e2e-song-y")!;
  const x = s0.pending!.find((i) => i.song.videoId === "e2e-song-x")!;
  await host.send({ type: "approve_song", itemId: y.id });
  await host.waitForState("Ben's song starts", (s) => s.nowPlaying?.song.videoId === "e2e-song-y");
  expect((await host.state())!.pending).toHaveLength(1);

  // Decline Ana's: it leaves her phone. She adds another and it is approved.
  await host.send({ type: "decline_song", itemId: x.id });
  await ana.waitForState("declined song is gone", (s) => (s.pending?.length ?? 0) === 0);
  await ana.addSong(song("z"));
  const z = (await host.waitForState("z pending", (s) => (s.pending?.length ?? 0) === 1)).pending![0];
  await host.send({ type: "approve_song", itemId: z.id });
  await host.waitForState("z waits its turn", (s) => s.upNext.some((i) => i.song.videoId === "e2e-song-z") || s.nowPlaying?.song.videoId === "e2e-song-z");

  // The host's own songs skip approval; a guest can't approve.
  await host.addSong(song("h"));
  await host.waitForState("host song queued", (s) => [s.nowPlaying, ...s.upNext].some((i) => i?.song.videoId === "e2e-song-h"));
  await ben.addSong(song("w"));
  const w = (await host.waitForState("w pending", (s) => (s.pending?.length ?? 0) === 1)).pending![0];
  expect(await ana.expectRefused({ type: "approve_song", itemId: w.id })).toBe("not_allowed");

  // Leaving "Host picks" lets pending songs in: nobody is stuck.
  await host.send({ type: "update_settings", settings: { queueMode: "rotation" } });
  await host.waitForState("pending cleared", (s) => (s.pending?.length ?? 0) === 0 && [s.nowPlaying, ...s.upNext].some((i) => i?.song.videoId === "e2e-song-w"));
});
