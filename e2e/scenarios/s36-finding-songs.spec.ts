import { test, expect } from "../lib/night";
import { en } from "../../packages/ui/src/i18n/en";

test("S36 · Finding songs @search", async ({ night }) => {
  await night.setup({ tv: false });
  const ana = await night.join("Ana", { viewport: { width: 820, height: 1180 } });
  const page = ana.page;
  // The catalog is real data: now and then a song's YouTube thumbnail is gone (404 from i.ytimg.com). The art falls back to a placeholder.
  ana.ignore.push("status of 404");
  const results = () => page.getByRole("button", { name: /^Add .* to queue$/ });
  const box = () => page.getByPlaceholder(en["search.placeholder"]);

  // 1. Home: the search bar next to the avatar opens Search.
  await page.getByRole("button", { name: en["search.placeholder"] }).first().click();
  await expect(box()).toBeVisible();

  // 2. Search, as you type: a prefix finds Queen, a typo still finds Bohemian Rhapsody.
  await ana.tab("Search");
  await box().pressSequentially("quen", { delay: 60 });
  await expect(results().first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /by Queen/ }).first()).toBeVisible();
  await box().fill("bohemain rhapsody");
  await expect(page.getByRole("button", { name: "Bohemian Rhapsody by Queen" }).first()).toBeVisible({ timeout: 15_000 });

  // 3. Accents don't matter, either way.
  await box().fill("que bello");
  await expect(page.getByRole("button", { name: /Qué bello/i }).first()).toBeVisible({ timeout: 15_000 });
  await box().fill("qué bello");
  await expect(page.getByRole("button", { name: /Qué bello/i }).first()).toBeVisible({ timeout: 15_000 });

  // 4. "Show more" adds more rows.
  await box().fill("love");
  await expect(results().first()).toBeVisible({ timeout: 15_000 });
  const first = await results().count();
  const more = page.getByRole("button", { name: en["search.showMore"] });
  if (await more.count()) {
    // Scrolling to the button also triggers the infinite scroll, so the list grows under the pointer: click it directly.
    await more.first().dispatchEvent("click").catch(() => {});
    await expect.poll(() => results().count()).toBeGreaterThan(first);
  }

  // 5. Pasting a YouTube link (the lookup is faked): "From your link" with the song; a bad one says so.
  await page.route("**/api/videos/**", (route) =>
    route.fulfill({ json: { song: { videoId: "dQw4w9WgXcQ", title: "Test Artist - Linked Song (Karaoke)", channel: "Sing King", durationSec: 200, thumbnailUrl: "" } } }),
  );
  await box().fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await expect(page.getByText(en["search.fromLink"])).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Add .*Linked Song.* to queue/ })).toBeVisible();
  await box().fill("");
  await page.getByRole("button", { name: en["search.paste"] }).click();
  await page.getByRole("textbox", { name: en["search.link"] }).fill("not a link at all");
  await expect(page.getByText(en["search.badLink"])).toBeVisible();

  // 6. When the live YouTube search is down (503), the page says search is resting.
  ana.ignore.push("503"); // the faked outage is a server error on purpose
  await page.keyboard.press("Escape");
  await page.route("**/api/search**", (route) => route.fulfill({ status: 503, json: { error: "unavailable", message: "resting" } }));
  await box().fill("zzqxjvkwp unknownsongzz");
  await box().press("Enter");
  await expect(page.getByText(new RegExp(`${en["search.resting"]}|${en["search.noResults"].replace('"{query}"', ".*")}`)).first()).toBeVisible({ timeout: 20_000 });
});
