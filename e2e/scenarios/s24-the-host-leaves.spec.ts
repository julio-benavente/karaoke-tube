import { test, expect } from "../lib/night";
import { es } from "../../packages/ui/src/i18n/es";
import { en } from "../../packages/ui/src/i18n/en";
import { song } from "../lib/songs";

test("S24 · The host leaves @leaving @i18n", async ({ night }) => {
  const { host, tv } = await night.setup({ songSec: 30, settings: { tvLayout: "clean" } });
  const ana = await night.join("Ana", { lang: "es" });
  const ben = await night.join("Ben", { lang: "es" });
  await ana.addSong(song("a1"));
  await ben.addSong(song("b1"));
  await host.waitForState("playing", (s) => s.playback.state === "playing");

  // Hana leaves on purpose: the party ends for everyone.
  await host.send({ type: "leave" });
  const ended = await ana.waitForState("ended on Ana's phone", (s) => s.status === "ended");
  await ben.waitForState("ended on Ben's phone", (s) => s.status === "ended");
  await tv!.waitForState("ended on the TV", (s) => s.status === "ended");
  expect(ended.nowPlaying).toBeNull();
  expect(ended.playback.state).toBe("idle");

  // The Spanish phones show the end of the night in Spanish.
  await expect(ana.page.getByText(new RegExp(`${es["shell.thanks"]}|Ha sido un gran momento|${es["story.wrap"]}`)).first()).toBeVisible({ timeout: 15_000 });
  await expect(ana.page.locator("body")).not.toContainText(en["shell.thanks"]);

  // A newcomer is told the party has ended (in Spanish too).
  const late = await night.tryJoin("Late", { lang: "es" });
  expect(late.ok).toBe(false);
  await expect(late.phone.page.getByText(es["error.room_ended"])).toBeVisible();

  // The public recap page opens for anyone, logged out.
  const recapId = ended.recap?.id;
  expect(recapId).toBeTruthy();
  const reader = await night.browser.newContext();
  const page = await reader.newPage();
  await page.goto(`/recap/${recapId}`);
  await expect(page.locator("body")).toContainText("Ana");
  await reader.close();
});
