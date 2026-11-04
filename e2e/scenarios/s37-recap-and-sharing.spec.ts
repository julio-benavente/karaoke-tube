import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";
import { song } from "../lib/songs";
import { en } from "../../packages/ui/src/i18n/en";

test("S37 · Recap and sharing @recap", async ({ night, browser }) => {
  const { host } = await night.setup({ countdown: 1, songSec: 3 });
  const [ana, ben, cleo, dev] = await Promise.all(["Ana", "Ben", "Cleo", "Dev"].map((n) => night.join(n)));
  const [anaId, benId] = await Promise.all([ana.memberId(), ben.memberId()]);
  await host.send({ type: "update_settings", settings: { maxWaitingPerMember: 3 } });
  await host.send({ type: "update_settings", settings: { countdownSec: 1 } });
  const tv = night.tv!;
  await tv.fake({ durations: { "e2e-song-c1": 9 } });

  // Six performances, in rotation order: a1, b1, c1, then d1 (his first) before a2 (her second), then b2. Cleo's song gets the most cheers.
  for (const [p, n] of [[ana, "a1"], [ben, "b1"], [cleo, "c1"], [ana, "a2"], [dev, "d1"], [ben, "b2"]] as const) {
    await p.addSong(song(n));
    await host.waitForState(`${n} queued`, (s) => [s.nowPlaying, ...s.upNext].some((i) => i?.song.videoId === `e2e-song-${n}`));
  }
  await host.waitForState("c1 playing", (s) => s.nowPlaying?.song.videoId === "e2e-song-c1" && s.playback.state === "playing", 40_000);
  for (let i = 0; i < 6; i++) {
    await dev.send({ type: "react", reaction: "fire" });
    await ben.send({ type: "react", reaction: "clap" });
    await sleep(600);
  }
  await host.waitForState("all sung", (s) => s.playback.state === "idle" && !s.nowPlaying && s.upNext.length === 0, 60_000);

  // The party ends: six performances in order, the most-cheered moment is Cleo's, and people got titles that fit.
  await host.send({ type: "end_party" });
  const ended = await host.waitForState("ended with recap", (s) => s.status === "ended" && !!s.recap);
  const recap = ended.recap!;
  expect(recap.performances.map((p) => p.item.song.videoId.replace("e2e-song-", ""))).toEqual(["a1", "b1", "c1", "d1", "a2", "b2"]);
  expect(recap.topMoment?.item.song.videoId).toBe("e2e-song-c1");
  expect(recap.titles[anaId]).toContain("opening_act");
  expect(recap.titles[benId]).toContain("grand_finale");
  for (const m of recap.members) if (m.nickname !== "Hana") expect(recap.titles[m.id]?.length, `${m.nickname} has titles`).toBeGreaterThanOrEqual(1);

  // The public page opens for someone not in the party; the picture can be saved and isn't empty.
  const reader = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: "en-US" });
  await reader.addInitScript(() => {
    (navigator as unknown as { canShare?: unknown }).canShare = undefined; // the share sheet is the system's; test the plain download
  });
  const page = await reader.newPage();
  await page.goto(`/recap/${recap.id}`);
  await expect(page.getByText(en["recap.titles"])).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(en["recap.setlist"])).toBeVisible();
  await expect(page.locator("body")).toContainText("Opening Act");
  const download = page.waitForEvent("download", { timeout: 20_000 });
  await page.getByRole("button", { name: en["recap.save"] }).click();
  const file = await download;
  const path = await file.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path!).size).toBeGreaterThan(5_000);

  // An unknown recap id is a clear "expired" page, not a crash.
  await page.goto("/recap/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText(en["recap.expired"])).toBeVisible({ timeout: 15_000 });
  await reader.close();
});

test("S37b · Recap edge cases (no songs, one song, titles off) @recap", async ({ night, browser }) => {
  // A party where nobody sang.
  const { host } = await night.setup({ tv: false });
  await night.join("Ana");
  await host.send({ type: "end_party" });
  const empty = (await host.waitForState("ended", (s) => s.status === "ended" && !!s.recap)).recap!;
  expect(empty.performances).toEqual([]);
  expect(empty.topMoment).toBeNull();
  const reader = await browser.newContext({ locale: "en-US" });
  const page = await reader.newPage();
  await page.goto(`/recap/${empty.id}`);
  await expect(page.locator("body")).not.toContainText(/undefined|NaN/);
  await expect(page.getByText(en["recap.title"]).first()).toBeVisible({ timeout: 15_000 });
  await reader.close();
});

test("S37c · Titles off @recap", async ({ night }) => {
  const { host } = await night.setup({ countdown: 1, songSec: 3, settings: { titles: false } });
  const ana = await night.join("Ana");
  await ana.addSong(song("only"));
  await host.waitForState("sung", (s) => s.playback.state === "playing");
  await host.waitForState("done", (s) => s.playback.state === "idle", 15_000);
  await host.send({ type: "end_party" });
  const recap = (await host.waitForState("ended", (s) => s.status === "ended" && !!s.recap)).recap!;
  expect(recap.performances).toHaveLength(1);
  expect(Object.values(recap.titles).flat()).toEqual([]);
});
