import { test, expect } from "../lib/night";

// A phone cannot be the host and the TV: it freezes the TV tab as soon as the host goes back to the host panel.
// Opening the TV link on the host's own phone shows a warning and no Start button. A desktop host still gets one.
test("S42 · A phone can't be the host and the TV @tv @phone", async ({ night }) => {
  await night.startParty("Hana", { phone: true });
  const page = await night.host.ctx.newPage();
  await page.goto(`/tv/${night.code}`);
  await expect(page.getByTestId("tv-same-phone")).toBeVisible();
  await expect(page.getByTestId("tv-start")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /host app/i })).toBeVisible();
  // The pairing page on the host's phone shows the warning too, not a code to pair with.
  await page.goto("/tv");
  await expect(page.getByTestId("tv-same-phone")).toBeVisible();
  await expect(page.getByTestId("tv-pair-code")).toHaveCount(0);
  await page.close();
});

// On the phone's host panel the TV address is text to type on the other device: tapping it must not open the TV here.
test("S42b · The no-TV banner on a phone @tv @phone", async ({ night }) => {
  await night.startParty("Hana", { phone: true });
  const page = night.host.page;
  await expect(page.getByTestId("tv-banner")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("tv-banner").getByRole("button", { name: /different device/i }).click();
  await expect(page.getByTestId("tv-link")).toBeVisible();
  expect(await page.getByTestId("tv-link").evaluate((el) => el.tagName)).not.toBe("A");
  await page.getByTestId("tv-banner-code").fill("12345");
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-juliobenavente-Documents-web-projects-karaoke-tube/938fa91a-4fb9-4bc5-966e-91eceba85531/scratchpad/phone-banner.png" });
});

// Desktop: the banner is a bar above the whole app and pushes it down (it does not float over the sidebar).
test("S42c · The no-TV banner pushes the desktop app down @tv", async ({ night }) => {
  await night.startParty("Hana");
  const page = night.host.page;
  const banner = page.getByTestId("tv-banner");
  await expect(banner).toBeVisible();
  const b = (await banner.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.y, "at the very top").toBeLessThanOrEqual(1);
  expect(b.width, "full width").toBeGreaterThanOrEqual(vp.width - 2);
  const sidebar = (await page.getByRole("navigation").first().boundingBox())!;
  expect(sidebar.y, "the app starts below the banner").toBeGreaterThanOrEqual(b.y + b.height - 1);
  await page.screenshot({ path: "/private/tmp/claude-501/-Users-juliobenavente-Documents-web-projects-karaoke-tube/938fa91a-4fb9-4bc5-966e-91eceba85531/scratchpad/desktop-banner.png" });
});
