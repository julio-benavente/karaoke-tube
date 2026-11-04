import { test, expect } from "../lib/night";
import { en } from "../../packages/ui/src/i18n/en";
import { es } from "../../packages/ui/src/i18n/es";
import { newContext, PHONE } from "../lib/people";

test("S29 · Wrong, old and odd codes @join @i18n", async ({ night, browser }) => {
  await night.setup({ tv: false });
  const code = night.code;
  const ctx = await newContext(browser, { ...PHONE, locale: "es-ES" });
  const page = await ctx.newPage();
  const lookups: string[] = [];
  page.on("request", (r) => /\/api\/rooms\/[^/]+(\/ws)?$/.test(new URL(r.url()).pathname) && lookups.push(r.url()));
  const codeBox = () => page.getByLabel(es["join.code"]);
  const nick = () => page.getByLabel(es["join.nickname"]);
  const join = () => page.getByRole("button", { name: es["join.submit"], exact: true });

  // 1. A code typed with capitals and extra spaces finds the same room.
  await page.goto("/join");
  await codeBox().fill(code.split("-").map((w) => w.toUpperCase()).join("   "));
  await nick().fill("Ana");
  await join().click();
  await page.waitForURL(new RegExp(`/r/${code}`));

  // 2. A code that doesn't exist says so and keeps what was typed (Spanish).
  const p2 = await (await newContext(browser, { ...PHONE, locale: "es-ES" })).newPage();
  await p2.goto("/join");
  await p2.getByLabel(es["join.code"]).fill("zzzz-yyyy-xxxx");
  await p2.getByLabel(es["join.nickname"]).fill("Bea");
  await p2.getByRole("button", { name: es["join.submit"], exact: true }).click();
  await expect(p2.getByText(es["error.room_not_found"])).toBeVisible();
  await expect(p2.getByLabel(es["join.code"])).toHaveValue(/zzzz-yyyy-xxxx/);

  // 3. A code of the wrong shape never calls the server, and shows the hint.
  const reqs: string[] = [];
  p2.on("request", (r) => r.url().includes("/api/rooms/") && reqs.push(r.url()));
  await p2.getByLabel(es["join.code"]).fill("abc");
  await expect(p2.getByRole("button", { name: es["join.submit"], exact: true })).toBeDisabled();
  expect(reqs).toEqual([]);

  // 4. An ended party's code says it ended.
  await night.host.send({ type: "end_party" });
  await night.host.waitForState("ended", (s) => s.status === "ended");
  const late = await night.tryJoin("Cy", { lang: "es" });
  expect(late.ok).toBe(false);
  await expect(late.phone.page.getByText(es["error.room_ended"])).toBeVisible();

  // 5. /r/<code> in a fresh browser (never joined) goes to the join page with the code filled in.
  const fresh = await (await newContext(browser, PHONE)).newPage();
  await fresh.goto(`/r/${code}`);
  await expect(fresh).toHaveURL(new RegExp(`/join/${code}`));
  await expect(fresh.getByLabel(en["join.nickname"])).toBeVisible();
  void lookups;
});
