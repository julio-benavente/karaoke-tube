import { request } from "@playwright/test";
import { test, expect } from "../lib/night";
import { DESKTOP, newContext } from "../lib/people";
import { song } from "../lib/songs";

test("S34 · Accounts and friends @accounts", async ({ night, browser }) => {
  const id = Date.now().toString(36).slice(-6);
  const hanaName = `hana_${id}`;
  const anaName = `ana_${id}`;
  const password = "correct-horse-1";
  const api = async (token: string, method: "get" | "post" | "put" | "patch", path: string, data?: unknown) => {
    const r = await request.newContext({ baseURL: "http://localhost:5174", extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const res = await r[method](`/api/account${path}`, data ? { data } : undefined);
    const body = await res.json().catch(() => null);
    await r.dispose();
    return { status: res.status(), body };
  };
  const register = async (username: string, displayName: string) => {
    const r = await request.newContext({ baseURL: "http://localhost:5174" });
    const res = await r.post("/api/account/register", { data: { username, password, displayName } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    await r.dispose();
    return body as { token: string; account: { id: string } };
  };

  // 1. Hana creates an account on the real page (a second tab-less browser of her own).
  const hctx = await newContext(browser, DESKTOP);
  const hp = await hctx.newPage();
  await hp.goto("/account");
  await hp.getByRole("button", { name: "Create account" }).first().click();
  await hp.getByLabel("Username").fill(hanaName);
  await hp.getByLabel("Display name").fill("Hana");
  await hp.getByLabel("Password", { exact: true }).fill(password);
  await hp.getByRole("button", { name: "Create account" }).last().click();
  await expect(hp.getByRole("tab", { name: "Favorites" })).toBeVisible({ timeout: 15_000 });
  const hanaToken = await hp.evaluate(() => localStorage.getItem("kt:account-token"));
  expect(hanaToken).toMatch(/^[0-9a-f]{64}$/);
  await hp.close();

  // Her saved room settings apply to the party she starts next.
  const saved = await api(hanaToken!, "patch", "/me", { roomSettings: { queueMode: "fifo", countdownSec: 7, maxWaitingPerMember: 3 } });
  expect(saved.status).toBe(200);
  await night.startParty("Hana", { ctx: hctx });
  const s0 = await night.host.waitForState("room made", (s) => s.members.length === 1);
  expect([s0.settings.queueMode, s0.settings.countdownSec, s0.settings.maxWaitingPerMember]).toEqual(["fifo", 7, 3]);
  night.watcher.allow("stuck");

  // 2. Ana has an account too; she joins signed in. They become friends.
  const ana = await register(anaName, "Ana");
  const anaPhone = await night.join("Ana", { token: ana.token });
  expect((await api(ana.token, "post", "/friends", { username: hanaName })).status).toBe(200);
  const asked = await api(hanaToken!, "get", "/friends");
  expect(JSON.stringify(asked.body)).toContain(anaName);
  expect((await api(hanaToken!, "post", `/friends/${ana.account.id}/accept`)).status).toBe(200);
  const hanasFriends = JSON.stringify((await api(hanaToken!, "get", "/friends")).body);
  const anasFriends = JSON.stringify((await api(ana.token, "get", "/friends")).body);
  expect(hanasFriends).toContain(anaName);
  expect(anasFriends).toContain(hanaName);

  // 3. Ana saves a song to her favorites and finds it on her account page.
  const fav = song("favourite");
  expect((await api(ana.token, "put", "/favorites", { song: fav })).status).toBe(200);
  await anaPhone.addSong(fav);
  await night.host.waitForState("Ana's song is up", (s) => !!s.nowPlaying);

  // 4. Hana signs in on a second device: her open party is offered, and it takes her back as the host.
  const second = await newContext(browser, DESKTOP);
  await second.addInitScript((t) => localStorage.setItem("kt:account-token", t), hanaToken!);
  const sp = await second.newPage();
  await sp.goto("/");
  await expect(sp.getByRole("heading", { name: "Back to your party" })).toBeVisible({ timeout: 15_000 });
  await sp.getByRole("button", { name: /Rejoin/ }).click();
  await expect(sp).toHaveURL(new RegExp(`/host/${night.code}`), { timeout: 15_000 });
  await expect(sp.getByRole("button", { name: "End", exact: true }).or(sp.getByText("Host", { exact: true })).first()).toBeVisible({ timeout: 15_000 });
  await second.close();

  // 5. The party ends: it is in the party log of each signed-in member.
  await night.host.send({ type: "end_party" });
  await expect
    .poll(async () => JSON.stringify((await api(hanaToken!, "get", "/parties")).body), { timeout: 15_000, message: "Hana's party log" })
    .toContain(night.code);
  await expect
    .poll(async () => JSON.stringify((await api(ana.token, "get", "/parties")).body), { timeout: 15_000, message: "Ana's party log" })
    .toContain(night.code);

  // Ana's favorites show on her page.
  await anaPhone.page.goto("/account");
  await anaPhone.page.getByRole("tab", { name: "Favorites" }).click();
  await expect(anaPhone.page.getByText("Song favourite", { exact: false })).toBeVisible();
});
