import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";
import { Watcher } from "./checks";
import type { RoomSettings } from "@karaoke-tube/shared";
import { en } from "../../packages/ui/src/i18n/en";
import { es } from "../../packages/ui/src/i18n/es";
import { DESKTOP, Host, newContext, PHONE, Person, Phone, Tv } from "./people";

type Opts = { lang?: "en" | "es"; viewport?: { width: number; height: number }; /** A signed-in account's token (see S34). */ token?: string; /** Makes this phone's clock wrong by this many ms (real phones are often seconds off). */ clockOffsetMs?: number };

/** One party and everyone in it. Made by the `night` fixture; closed (and checked) when the scenario ends. */
export class Night {
  code = "";
  lang: "en" | "es" = "en";
  host!: Host;
  tv: Tv | null = null;
  phones: Phone[] = [];
  readonly watcher = new Watcher(() => this.everyone());

  constructor(readonly browser: Browser) {}

  /** Screens a scenario made by hand (a second TV, a paired TV…): watched and closed with the rest. */
  readonly others: Person[] = [];
  adopt<T extends Person>(p: T): T {
    this.others.push(p);
    return p;
  }

  everyone(): Person[] {
    return [this.host, ...(this.tv ? [this.tv] : []), ...this.phones, ...this.others].filter(Boolean);
  }

  /** The host makes a party the way a person does: /host/new, a name, "Start the party". */
  async startParty(name = "Hana", o: { lang?: "en" | "es"; ctx?: BrowserContext } = {}) {
    this.lang = o.lang ?? "en";
    const d = o.lang === "es" ? es : en;
    const ctx = o.ctx ?? (await newContext(this.browser, { ...DESKTOP, ...(o.lang === "es" ? { locale: "es-ES" } : {}) }));
    const page = await ctx.newPage();
    this.host = new Host(name, ctx, page);
    await page.goto("/host/new");
    if (o.ctx) await expect(page.getByLabel(d["newparty.name"])).not.toHaveValue("", { timeout: 10_000 }); // a signed-in host starts with their own name
    else await page.getByLabel(d["newparty.name"]).fill(name);
    await page.getByRole("button", { name: d["newparty.start"] }).click();
    await page.waitForURL(/\/host\/[a-z]+-[a-z]+-[a-z]+/);
    this.code = page.url().split("/host/")[1].split(/[/?#]/)[0];
    await expect.poll(() => this.host.connected(), { message: "host connects" }).toBe(true);
    this.watcher.start();
    return this;
  }

  /** The TV page, opened the way the host's "Open TV screen" button does (same browser, host's login), then "Start party". */
  async openTv({ press = true } = {}) {
    const page = await this.host.ctx.newPage();
    this.tv = new Tv("TV", this.host.ctx, page);
    await page.goto(`/tv/${this.code}`);
    await expect(page.getByTestId("tv-start")).toBeVisible();
    if (press) {
      await this.tv.pressStart();
      await expect.poll(() => this.tv!.connected(), { message: "TV connects" }).toBe(true);
    }
    return this.tv;
  }

  /** A guest joins from a phone: the join page, a nickname, "Join". */
  async join(name: string, opts: Opts = {}) {
    opts = { ...opts, lang: opts.lang ?? this.lang }; // the join page speaks the ROOM's language, whatever the phone's
    const ctx = await newContext(this.browser, { ...PHONE, ...(opts.viewport ? { viewport: opts.viewport } : {}), ...(opts.lang === "es" ? { locale: "es-ES" } : {}) });
    if (opts.token) await ctx.addInitScript((t) => localStorage.setItem("kt:account-token", t), opts.token);
    if (opts.clockOffsetMs) await ctx.addInitScript((ms) => { const real = Date.now.bind(Date); (window as unknown as { __realNow: () => number }).__realNow = real; Date.now = () => real() + ms; }, opts.clockOffsetMs);
    const page = await ctx.newPage();
    const phone = new Phone(name, ctx, page);
    phone.lang = opts.lang ?? "en";
    this.phones.push(phone);
    await page.goto(`/join/${this.code}`);
    const d = opts.lang === "es" ? es : en;
    await page.getByLabel(d["join.nickname"]).fill(name);
    await page.getByRole("button", { name: d["join.submit"], exact: true }).click();
    await page.waitForURL(new RegExp(`/r/${this.code}`));
    await expect.poll(() => phone.connected(), { message: `${name} connects` }).toBe(true);
    return phone;
  }

  /** Tries to join; says whether it worked, and what the page showed if not. Nothing is asserted. */
  async tryJoin(name: string, opts: Opts = {}): Promise<{ phone: Phone; ok: boolean; text: string }> {
    opts = { ...opts, lang: opts.lang ?? this.lang };
    const ctx = await newContext(this.browser, { ...PHONE, ...(opts.viewport ? { viewport: opts.viewport } : {}), ...(opts.lang === "es" ? { locale: "es-ES" } : {}) });
    if (opts.token) await ctx.addInitScript((t) => localStorage.setItem("kt:account-token", t), opts.token);
    if (opts.clockOffsetMs) await ctx.addInitScript((ms) => { const real = Date.now.bind(Date); (window as unknown as { __realNow: () => number }).__realNow = real; Date.now = () => real() + ms; }, opts.clockOffsetMs);
    const page = await ctx.newPage();
    const phone = new Phone(name, ctx, page);
    phone.lang = opts.lang ?? "en";
    this.phones.push(phone);
    const d = opts.lang === "es" ? es : en;
    await page.goto(`/join/${this.code}`);
    await page.getByLabel(d["join.nickname"]).fill(name);
    await page.getByRole("button", { name: d["join.submit"], exact: true }).click();
    const ok = await page.waitForURL(new RegExp(`/r/${this.code}`), { timeout: 6000 }).then(() => true, () => false);
    if (ok) await expect.poll(() => phone.connected(), { message: `${name} connects` }).toBe(true);
    return { phone, ok, text: await phone.bodyText() };
  }

  /**
   * The usual start: a party, (optionally) a TV playing short fake songs, a short countdown, and some guests.
   * `tv: false` leaves the first song waiting in "get ready" forever, which keeps queue orders still for ordering tests
   * (the "stuck" check is switched off for those).
   */
  async setup(o: { host?: string; lang?: "en" | "es"; tv?: boolean; countdown?: number; songSec?: number; guests?: string[]; settings?: Partial<RoomSettings> } = {}) {
    await this.startParty(o.host ?? "Hana", { lang: o.lang });
    const tv = o.tv === false ? null : await this.openTv();
    if (tv) await tv.fake({ defaultDuration: o.songSec ?? 3 });
    else this.watcher.allow("stuck");
    await this.host.send({ type: "update_settings", settings: { countdownSec: o.countdown ?? 1, ...o.settings } });
    const guests: Phone[] = [];
    for (const g of o.guests ?? []) guests.push(await this.join(g));
    return { host: this.host, tv, guests };
  }

  async finish() {
    await this.watcher.stop();
    const problems = this.watcher.violations;
    await Promise.all(this.everyone().map((p) => p.close()));
    return problems;
  }
}

export const test = base.extend<{ night: Night }>({
  night: async ({ browser }, use) => {
    const night = new Night(browser);
    await use(night);
    const problems = await night.finish();
    expect.soft(problems, "the checks that ran during the scenario found problems").toEqual([]);
  },
});
export { expect };
