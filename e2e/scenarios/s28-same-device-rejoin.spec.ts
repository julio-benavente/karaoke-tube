import { test, expect } from "../lib/night";
import { en } from "../../packages/ui/src/i18n/en";
import { song } from "../lib/songs";

test("S28 · Coming back on the same device @join", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana");
  const anaId = await ana.memberId();
  await ana.addSong(song("a1"));
  await host.waitForState("queued", (s) => !!s.nowPlaying);

  // 1. Ana closes the tab and opens the site later: she is taken straight back into the party, as the same person.
  await ana.goOffline();
  await ana.comeBack("/");
  await expect(ana.page).toHaveURL(new RegExp(`/r/${night.code}`), { timeout: 15_000 });
  await expect.poll(() => ana.connected(), { timeout: 15_000 }).toBe(true);
  expect(await ana.memberId()).toBe(anaId);

  // 2. The host does the same: the home page offers "Back to your party" and one tap goes to the host app (not the guest view).
  await host.goOffline();
  await host.comeBack("/");
  await expect(host.page.getByRole("heading", { name: en["resume.title"] })).toBeVisible();
  await host.page.getByRole("button", { name: new RegExp(en["resume.open"]) }).click();
  await expect(host.page).toHaveURL(new RegExp(`/host/${night.code}`));
  await expect.poll(() => host.connected(), { timeout: 15_000 }).toBe(true);

  // 3. A saved spot that is no longer valid ("forgotten") says so and offers a fresh start, not a loading loop.
  await ana.page.evaluate((code) => localStorage.setItem(`kt:room:${code}`, JSON.stringify({ memberId: "gone", key: "wrong" })), night.code);
  await ana.page.goto(`/r/${night.code}`);
  await expect(ana.page.getByText(en["shell.forgotten"])).toBeVisible({ timeout: 15_000 });
  await expect(ana.page.getByRole("link", { name: en["shell.joinAgain"] }).or(ana.page.getByRole("button", { name: en["shell.joinAgain"] }))).toBeVisible();

  // 4. The party ends while Ana is away: she is told it ended instead of waiting forever.
  const bob = await night.join("Bob");
  await host.send({ type: "end_party" });
  await bob.waitForState("ended", (s) => s.status === "ended");
  await bob.goOffline();
  await bob.comeBack(`/r/${night.code}`);
  await expect(bob.page.getByText(new RegExp(`${en["shell.thanks"]}|${en["story.wrap"]}|${en["shell.forgotten"]}|${en["error.room_ended"]}`)).first()).toBeVisible({ timeout: 15_000 });
});
