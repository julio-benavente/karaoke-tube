import { test, expect } from "../lib/night";
import { englishLeftovers } from "../lib/english";
import { es } from "../../packages/ui/src/i18n/es";
import { song } from "../lib/songs";

test("S35 · A night in Spanish @i18n", async ({ night }) => {
  const { host, tv } = await night.setup({ lang: "es", countdown: 2, songSec: 8, settings: { tvLayout: "bar" } });
  await tv!.fake({ durations: { "e2e-song-a1": 60 } });
  const ana = await night.join("Ana", { lang: "es" });
  const ben = await night.join("Ben", { lang: "es" });
  const cleo = await night.join("Cleo", { lang: "es" });

  // Three songs: Ben is up in 1 song, Cleo in 2 (singular / plural in Spanish).
  await ana.addSong(song("a1"));
  await host.waitForState("Ana sings", (s) => s.nowPlaying?.song.videoId === "e2e-song-a1");
  await ben.addSong(song("b1"));
  await cleo.addSong(song("c1"));
  await host.waitForState("queued", (s) => s.upNext.length === 2);
  await ben.tab("Queue");
  await expect(ben.page.getByText(es["queue.banner.next"]).first()).toBeVisible();
  await cleo.tab("Queue");
  await expect(cleo.page.getByText(es["queue.banner.soon_other"].replace("{count}", "2")).first()).toBeVisible();

  // Nothing is left in English on the phones, the host app or the TV (card and bar).
  for (const p of [ana, ben, cleo, host]) expect(englishLeftovers(await p.bodyText()), `${p.name} shows English`).toEqual([]);
  expect(englishLeftovers(await tv!.deepText()), "TV shows English").toEqual([]);

  // Ben switches his own phone to English: only his phone changes.
  await ben.page.evaluate(() => localStorage.setItem("kt:lang", "en"));
  await ben.reloadAndSettle();
  ben.lang = "en"; // (the test helper looks for his tabs by their English names now)
  await ben.tab("Queue");
  await expect(ben.page.getByText("You're up next!").first()).toBeVisible();
  await cleo.tab("Queue");
  expect(await cleo.bodyText()).toContain(es["queue.banner.soon_other"].replace("{count}", "2"));
  expect(await tv!.deepText()).not.toContain("Now singing");

  // The recap and the end of the night are Spanish too.
  await host.send({ type: "skip" });
  await host.send({ type: "skip" });
  await host.send({ type: "skip" });
  await host.send({ type: "end_party" });
  const ended = await host.waitForState("ended", (s) => s.status === "ended" && !!s.recap);
  await cleo.page.goto(`/recap/${ended.recap!.id}`);
  await expect(cleo.page.getByText(es["recap.title"]).first()).toBeVisible({ timeout: 15_000 });
  expect(englishLeftovers(await cleo.bodyText()), "recap shows English").toEqual([]);
});
