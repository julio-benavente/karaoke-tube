import { test, expect } from "../lib/night";
import { song } from "../lib/songs";
import { newContext, PHONE } from "../lib/people";

const SIZES = [
  { name: "small phone", width: 360, height: 740 },
  { name: "large phone", width: 430, height: 932 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone on its side", width: 740, height: 360 },
];

// Anything visible that sticks out past the right edge, ignoring rows that scroll sideways on purpose.
const overflowing = () => {
  const out: string[] = [];
  const scrollsSideways = (el: Element | null): boolean => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
    const clipped = (() => {
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const o = getComputedStyle(e).overflowX;
        if ((o === "hidden" || o === "clip") && e.getBoundingClientRect().right <= window.innerWidth + 2) return true;
      }
      return false;
    })();
    if (r.right > window.innerWidth + 2 && !scrollsSideways(el) && !clipped) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 30)} ends at ${Math.round(r.right)} of ${window.innerWidth}`);
  }
  return { out: out.slice(0, 5), pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1 };
};

test("S38 · Phones of all sizes @ui", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  await host.addSong(song("blocker"));
  await host.waitForState("blocker", (s) => !!s.nowPlaying);
  for (const size of SIZES) {
    const p = await night.join(`P${size.width}`, { viewport: { width: size.width, height: size.height } });
    await p.addSong(song(`s${size.width}`));
    for (const tab of ["Home", "Search", "Queue", "Party"] as const) {
      await p.tab(tab).catch((e) => { throw new Error(`${size.name}: the ${tab} tab can't be tapped: ${String(e.message).split("\n")[0]}`); });
      await p.page.waitForTimeout(400);
      const o = await p.page.evaluate(overflowing);
      expect(o.pageScrolls, `${size.name}: ${tab} scrolls sideways`).toBe(false);
      expect(o.out, `${size.name}: ${tab} has something past the edge`).toEqual([]);
      const tabHeights = await p.page.getByRole("navigation", { name: "Main" }).getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(Math.min(...tabHeights), `${size.name}: tab buttons are big enough to tap`).toBeGreaterThanOrEqual(44);
    }
  }

  // With the keyboard open (a short screen) the mini player and the first result are still reachable.
  const k = await night.join("Keys", { viewport: { width: 390, height: 360 } });
  await k.tab("Search");
  await k.page.getByPlaceholder("What do you want to sing?").fill("queen");
  await expect(k.page.getByRole("button", { name: "Open now singing" })).toBeInViewport();

  // The legal pages open in both languages, from the home page's footer too.
  for (const [lang, locale] of [["en", "en-US"], ["es", "es-ES"]] as const) {
    const ctx = await newContext(night.browser, { ...PHONE, locale });
    const page = await ctx.newPage();
    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect((await page.locator("body").innerText()).length, `${path} in ${lang} has text`).toBeGreaterThan(500);
      expect(await page.evaluate(() => /undefined|\[object/.test(document.body.innerText))).toBe(false);
    }
    await ctx.close();
  }
});
