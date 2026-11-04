import { test, expect } from "../lib/night";

test("S01 · Solo night @core", async ({ night }) => {
  await night.startParty("Hana");
  const tv = await night.openTv();
  await tv.fake({ defaultDuration: 5 });
  const { host } = night;

  // Hana adds a song from the host app's Home page.
  await host.page.getByRole("button", { name: "Add to queue" }).first().click();
  const countdown = await host.waitForState("get ready", (s) => s.playback.state === "get_ready");
  expect(countdown.settings.countdownSec).toBe(5);

  // The TV shows its get-ready card with a number while the room counts down.
  await expect(tv.page.locator("[data-countdown]")).toBeVisible();

  // The room starts the song once the TV's player reports it started.
  await host.waitForState("playing", (s) => s.playback.state === "playing" && !!s.nowPlaying, 15_000);
  await expect(tv.page.locator("[data-countdown]")).toHaveCount(0);

  // The song ends by itself and everything goes idle.
  await host.waitForState("idle again", (s) => s.playback.state === "idle" && !s.nowPlaying, 20_000);

  // End the party from the host app.
  await host.page.getByRole("button", { name: "End", exact: true }).click();
  await host.page.getByRole("button", { name: "End party" }).click();
  await host.waitForState("ended", (s) => s.status === "ended");
});
