import { test, expect } from "../lib/night";
import { sleep } from "../lib/people";

// A phone host uses the same phone as the TV. A TV in another tab is frozen by the phone as soon as you leave it, so on a
// phone the TV runs in a frame inside the host panel: tap Start once, then move around the panel while the songs go on.
test("S42 · The phone is the TV, inside the host panel @tv @phone", async ({ night }) => {
  await night.startParty("Hana", { phone: true });
  const { host } = night;
  const page = host.page;
  await host.send({ type: "update_settings", settings: { countdownSec: 1 } });
  const ana = await night.join("Ana");

  // 1. No TV yet: the strip offers "Open TV screen". It opens the frame in this page, not another tab.
  const pagesBefore = host.ctx.pages().length;
  await expect(page.getByTestId("tv-banner")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("tv-banner").getByRole("button", { name: /open tv screen/i }).click();
  await expect(page.getByTestId("phone-tv")).toBeVisible();
  expect(host.ctx.pages().length, "no second tab").toBe(pagesBefore);

  // 2. One tap on the frame's Start, and the room has a TV.
  const frame = page.frameLocator('[data-testid="phone-tv"] iframe');
  await frame.getByTestId("tv-start").click();
  await expect(page.getByTestId("tv-banner")).toBeHidden({ timeout: 10_000 });
  const tvFrame = page.frames().find((f) => f.url().includes("/tv/"))!;
  await tvFrame.evaluate(() => ((window as unknown as { __fakeYT: { settings: Record<string, unknown> } }).__fakeYT.settings.defaultDuration = 4));

  // 3. A song plays in the frame; the host moves between tabs; the songs keep coming without going back to the TV.
  await ana.addSong("bohemian");
  await ana.addSong("uptown");
  await host.waitForState("first song plays", (s) => s.playback.state === "playing" && s.nowPlaying?.song.videoId === "e2e-bohemian", 20_000);
  for (const tab of ["Search", "Queue", "Party", "Home"]) {
    await page.getByRole("navigation").getByRole("button", { name: new RegExp(tab) }).click();
    await sleep(600);
  }
  await expect(page.getByTestId("phone-tv")).toBeVisible();
  await host.waitForState("second song plays", (s) => s.nowPlaying?.song.videoId === "e2e-uptown" && s.playback.state === "playing", 20_000);
  const loads = await tvFrame.evaluate(() => (window as unknown as { __fakeYT: { loads: string[] } }).__fakeYT.loads);
  expect(loads.slice(0, 2)).toEqual(["e2e-bohemian", "e2e-uptown"]);

  // 4. Shrink it to a corner, then stop using the phone as the TV: the strip comes back.
  await page.getByRole("button", { name: /shrink the tv/i }).click();
  await expect(page.getByRole("button", { name: /show the tv/i })).toBeVisible();
  await page.getByRole("button", { name: /stop using this phone as the tv/i }).click();
  await expect(page.getByTestId("phone-tv")).toBeHidden();
});
