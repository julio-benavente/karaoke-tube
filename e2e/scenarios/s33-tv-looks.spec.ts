import { test, expect } from "../lib/night";
import { song } from "../lib/songs";

const BAR = { small: 9, medium: 13, large: 18 } as const;

test("S33 · TV looks @tv", async ({ night }) => {
  const { host, tv } = await night.setup({ countdown: 3, songSec: 200 });
  const long = await night.join("Maximiliano-Alexander-Jr");
  const barHeightPct = () =>
    tv!.page.evaluate(() => {
      const find = (root: Document | ShadowRoot): Element | null => {
        const hit = root.querySelector(".kt-tvbar");
        if (hit) return hit;
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const r = find(el.shadowRoot); if (r) return r; }
        return null;
      };
      const bar = find(document);
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      return { pct: (r.height / window.innerHeight) * 100, fits: r.left >= 0 && r.right <= window.innerWidth + 1 };
    });

  // 1. The lobby: no bar. The get-ready card: no bar. During the song: the bar, at the chosen size.
  expect(await barHeightPct()).toBeNull();
  await long.addSong({ ...song("a-very-long-title"), title: "Artist With A Very Very Long Name - The Song With An Extremely Long Title That Goes On And On (Karaoke Version)" });
  await host.waitForState("get ready", (s) => s.playback.state === "get_ready");
  expect(await barHeightPct()).toBeNull();
  await host.waitForState("playing", (s) => s.playback.state === "playing");
  for (const size of ["small", "medium", "large"] as const) {
    await host.send({ type: "update_settings", settings: { tvLayout: "bar", tvBarSize: size } });
    await expect.poll(async () => Math.round((await barHeightPct())?.pct ?? 0), { message: `bar size ${size}` }).toBeGreaterThanOrEqual(BAR[size] - 1);
    const bar = (await barHeightPct())!;
    expect(bar.pct).toBeLessThanOrEqual(BAR[size] + 1);
    expect(bar.fits, "a long name and title don't push the bar off screen").toBe(true);
  }

  // 2. Clean (full screen): no bar at all, switched live.
  await host.send({ type: "update_settings", settings: { tvLayout: "clean" } });
  await expect.poll(barHeightPct).toBeNull();

  // 3. Back to a bar, then refresh the TV: the setting persists.
  await host.send({ type: "update_settings", settings: { tvLayout: "bar", tvBarSize: "large" } });
  await tv!.reload();
  await tv!.pressStart();
  await expect.poll(async () => Math.round((await barHeightPct())?.pct ?? 0), { timeout: 15_000 }).toBeGreaterThanOrEqual(BAR.large - 1);

  // 4. The full-screen button is there and clicking it doesn't break anything.
  await tv!.page.getByRole("button", { name: "Full screen" }).click();
  await expect(tv!.page.getByTestId("tv-page")).toBeVisible();

  // 5. Layout switches during a get-ready card and in the lobby don't break either.
  await host.send({ type: "skip" });
  await host.waitForState("idle", (s) => s.playback.state === "idle");
  await host.send({ type: "update_settings", settings: { tvLayout: "clean" } });
  await long.addSong(song("again"));
  await host.waitForState("get ready", (s) => s.playback.state === "get_ready");
  await host.send({ type: "update_settings", settings: { tvLayout: "bar", tvBarSize: "small" } });
  await host.waitForState("playing", (s) => s.playback.state === "playing");
});
