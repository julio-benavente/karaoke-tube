import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

test("S21 · Show the code on the TV @tv @join", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 2, songSec: 300, settings: { joinInfo: "between", tvLayout: "clean" } });
  const ana = await night.join("Ana");
  const joinCard = () => tv!.joinCardVisible();

  // Between songs (the lobby) the TV shows the code; during a song it doesn't.
  await expect.poll(joinCard).toBe(true);
  await ana.addSong(song("long"));
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  await expect.poll(joinCard, { message: "no join card over a song in 'between'" }).toBe(false);

  // "Show code on TV": it appears over the song for a while, then goes.
  await host.send({ type: "show_join" });
  await expect.poll(joinCard, { message: "flash shows the code" }).toBe(true);
  await expect.poll(joinCard, { timeout: 25_000, message: "flash goes away" }).toBe(false);

  // "Always": the code stays over the song.
  await host.send({ type: "update_settings", settings: { joinInfo: "always" } });
  await expect.poll(joinCard).toBe(true);

  // Someone joins by QR (a new phone) mid-song and adds a song; playback is undisturbed.
  const eli = await night.join("Eli");
  await eli.addSong(song("eli"));
  await host.waitForState("Eli queued", (s) => s.upNext.length === 1);
  expect((await host.state())!.playback.state).toBe("playing");

  // "Start": only in the lobby, not over the song.
  await host.send({ type: "update_settings", settings: { joinInfo: "start" } });
  await expect.poll(joinCard).toBe(false);

  // The bar layout always carries the join QR + code (it is part of the bar), whatever the setting.
  await host.send({ type: "update_settings", settings: { tvLayout: "bar" } });
  await expect.poll(() => tv!.deepText().then((t) => /join the party/i.test(t))).toBe(true);
});
