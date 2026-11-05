import { test, expect } from "../lib/night";
import { newContext, DESKTOP, Tv } from "../lib/people";
import { en } from "../../packages/ui/src/i18n/en";
import { song } from "../lib/songs";

// The pairing code renews every 8 s here (`/tv?rotate=8`); in the real app every ~5 minutes.
test("S30 · Pair a TV with a code @tv", async ({ night, browser }) => {
  const { host } = await night.setup({ tv: false, countdown: 2, songSec: 5 });
  host.ignore.push("status of 404"); // the browser logs the refused (expired / wrong) pairing codes this scenario tries
  const readCode = async (tv: Tv) => (await tv.page.getByTestId("tv-pair-code").innerText()).replace(/\s+/g, "").toUpperCase();
  const openTvPage = async (name: string) => {
    const ctx = await newContext(browser, DESKTOP);
    const tv = night.adopt(new Tv(name, ctx, await ctx.newPage()));
    await tv.page.goto("/tv?rotate=8");
    await expect(tv.page.getByTestId("tv-pair-code")).toHaveText(/[A-Z2-9]{3}\s?[A-Z2-9]{3}/);
    return tv;
  };
  // The offline banner has its own pair form (testid tv-banner-code): this scenario uses the one in Settings → TV screen.
  const pairButton = () => host.page.getByTestId("tv-screen-settings").getByRole("button", { name: en["tvscreen.pairButton"] });
  const pairFromHost = async (code: string) => {
    const input = host.page.getByTestId("tv-pair-input");
    if (!(await input.isVisible())) await host.page.getByRole("button", { name: "Settings", exact: true }).click();
    await input.fill(code);
    await pairButton().click();
  };

  // 1. The TV shows a code and a renewal timer; the host types the code in Settings → TV screen and the TV joins the party.
  const tv1 = await openTvPage("TV 1");
  const code1 = await readCode(tv1);
  expect(code1).toMatch(/^[A-Z2-9]{6}$/);
  await expect(tv1.page.getByTestId("tv-pair-timer")).toHaveText(/\d+:\d\d/);
  await pairFromHost(code1);
  await expect(tv1.page).toHaveURL(new RegExp(`/tv/${night.code}`), { timeout: 15_000 });
  await tv1.page.getByTestId("tv-start").click();
  await host.waitForState("TV is paired and connected", (s) => s.screenPaired === true && s.playerConnected === true);
  await tv1.fake({ defaultDuration: 5 });
  await night.watcher.allow("noCountdown"); // (the paired TV is a different kind of screen for the checks below)

  // 2. A song plays on the paired TV.
  const ana = await night.join("Ana");
  await ana.addSong(song("a1"));
  await host.waitForState("plays on the paired TV", (s) => s.playback.state === "playing", 20_000);
  await host.waitForState("done", (s) => s.playback.state === "idle", 15_000);

  // 3. A second TV page shows its own code; the renewal timer never goes negative or odd, and a renewed code replaces the old one.
  const tv2 = await openTvPage("TV 2");
  const old = await readCode(tv2);
  for (let i = 0; i < 6; i++) {
    const text = await tv2.page.getByTestId("tv-pair-timer").innerText();
    const m = text.match(/(\d+):(\d\d)/);
    expect(m, `timer text: ${text}`).toBeTruthy();
    expect(Number(m![1]) * 60 + Number(m![2])).toBeLessThanOrEqual(9);
    await tv2.page.waitForTimeout(1500);
  }
  await expect.poll(() => readCode(tv2), { timeout: 15_000, message: "the code renews by itself" }).not.toBe(old);
  await pairFromHost(old);
  await expect(host.page.getByText(en["tvscreen.notFound"])).toBeVisible();

  // 4. A wrong code says so and pairs nothing.
  await host.page.getByTestId("tv-pair-input").fill("ZZZZZZ");
  await pairButton().click();
  await expect(host.page.getByText(en["tvscreen.notFound"])).toBeVisible();

  // 5. The new code pairs the second TV, which replaces the first one: the first goes back to showing a code.
  await host.page.getByTestId("tv-pair-input").fill(await readCode(tv2));
  await pairButton().click();
  await expect(tv2.page).toHaveURL(new RegExp(`/tv/${night.code}`), { timeout: 15_000 });
  await expect(tv1.page).toHaveURL(/\/tv(\?|$)/, { timeout: 15_000 });
  await expect(tv1.page.getByTestId("tv-pair-code")).toBeVisible();

  // 6. The host removes the screen: it goes back to showing a code, and the party has no screen.
  await tv2.page.getByTestId("tv-start").click();
  await host.waitForState("second TV connected", (s) => s.screenPaired === true && s.playerConnected === true);
  await host.send({ type: "remove_screen" });
  await host.waitForState("no screen", (s) => s.screenPaired === false);
  await expect(tv2.page.getByTestId("tv-pair-code")).toBeVisible({ timeout: 15_000 });
});
