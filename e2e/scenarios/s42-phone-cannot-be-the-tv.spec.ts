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
  await page.close();
});
