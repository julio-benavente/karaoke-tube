import { test, expect } from "../lib/night";
import { englishLeftovers } from "../lib/english";
import { es } from "../../packages/ui/src/i18n/es";
import { newContext, PHONE, Phone } from "../lib/people";
import { song } from "../lib/songs";
import { WORDS_ES } from "../../apps/api/src/words-es";

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

  // The party code is made of Spanish words (the host started the party in Spanish).
  const words = night.code.split("-");
  expect(WORDS_ES as readonly string[], "code words").toEqual(expect.arrayContaining([words[0], words[1]]));

  // Ben's own phone prefers English, but the party is in Spanish: he still sees Spanish.
  await ben.page.evaluate(() => localStorage.setItem("kt:lang", "en"));
  await ben.reloadAndSettle();
  await ben.tab("Queue");
  await expect(ben.page.getByText(es["queue.banner.next"]).first()).toBeVisible();
  expect(englishLeftovers(await ben.bodyText()), "Ben shows English").toEqual([]);
  expect(await tv!.deepText()).not.toContain("Now singing");

  // A guest whose phone is in English opens the party link: the join page itself speaks the party's language.
  const danCtx = await newContext(night.browser, PHONE);
  await danCtx.addInitScript(() => localStorage.setItem("kt:lang", "en"));
  const dan = night.adopt(new Phone("Dan", danCtx, await danCtx.newPage()));
  dan.lang = "es";
  await dan.page.goto(`/join/${night.code}`);
  await expect(dan.page.getByLabel(es["join.nickname"])).toBeVisible();
  expect(englishLeftovers(await dan.bodyText()), "Dan's join page shows English").toEqual([]);
  await dan.page.getByLabel(es["join.nickname"]).fill("Dan");
  await dan.page.getByRole("button", { name: es["join.submit"], exact: true }).click();
  await dan.page.waitForURL(new RegExp(`/r/${night.code}`));
  await expect.poll(() => dan.connected(), { message: "Dan connects" }).toBe(true);
  expect(englishLeftovers(await dan.bodyText()), "Dan shows English").toEqual([]);

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
