import { test, expect } from "../lib/night";
import { en } from "../../packages/ui/src/i18n/en";

test("S18 · Lock the door @join", async ({ night }) => {
  const { host } = await night.setup({ tv: false });
  const ana = await night.join("Ana");

  // Locked: Eli sees why, and what he typed stays.
  await host.send({ type: "update_settings", settings: { locked: true } });
  await ana.waitForState("locked", (s) => s.settings.locked);
  const eli = await night.tryJoin("Eli");
  expect(eli.ok).toBe(false);
  await expect(eli.phone.page.getByText(en["error.room_locked"])).toBeVisible();
  await expect(eli.phone.page.getByLabel("Nickname")).toHaveValue("Eli");

  // Ana, already in, closes the tab and comes back: still a member.
  await ana.reopen();
  await expect.poll(() => ana.connected(), { timeout: 15_000 }).toBe(true);
  expect((await host.state())!.members.map((m) => m.nickname)).toEqual(["Hana", "Ana"]);

  // Unlocked: Eli presses Join again and is in, no refresh.
  await host.send({ type: "update_settings", settings: { locked: false } });
  await eli.phone.page.getByRole("button", { name: "Join", exact: true }).click();
  await eli.phone.page.waitForURL(new RegExp(`/r/${night.code}`));
  await host.waitForState("Eli is in", (s) => s.members.some((m) => m.nickname === "Eli"));

  // Locking and joining in the same instant: either way the room ends up consistent.
  const [fay] = await Promise.all([night.tryJoin("Fay"), host.send({ type: "update_settings", settings: { locked: true } })]);
  const members = (await host.waitForState("settled", (s) => s.settings.locked)).members;
  expect(members.some((m) => m.nickname === "Fay")).toBe(fay.ok);
  if (!fay.ok) await expect(fay.phone.page.getByText(en["error.room_locked"])).toBeVisible();
});
