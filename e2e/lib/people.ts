import { devices, type Browser, type BrowserContext, type ConsoleMessage, type Page, type WebSocketRoute, expect } from "@playwright/test";
import type { ClientMessage, ErrorCode, RoomState, Song } from "@karaoke-tube/shared";
import { en } from "../../packages/ui/src/i18n/en";
import { es } from "../../packages/ui/src/i18n/es";
import { installFakeYT, type FakeYTSettings } from "./fakeYT";
import { SONGS, type SongKey } from "./songs";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One person at one screen: their own browser context (own storage, like a separate device) and page. */
export class Person {
  /** Errors and oddities this screen has shown (console errors, exceptions, server errors). Checked at the end. */
  readonly problems: string[] = [];
  /** Errors the room sent this person (`not_allowed`, `queue_limit`…), oldest first. */
  roomErrors: ErrorCode[] = [];
  /** Problems a scenario expects and doesn't want reported (substring match). */
  ignore: string[] = [];

  constructor(
    readonly name: string,
    readonly ctx: BrowserContext,
    public page: Page,
  ) {
    this.watchPage(page);
  }

  protected watchPage(page: Page) {
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "error") this.problem(`console.error: ${m.text()}`);
    });
    page.on("pageerror", (e) => this.problem(`exception: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 500) this.problem(`${r.status()} from ${r.url()}`);
    });
  }

  protected problem(text: string) {
    if (this.ignore.some((s) => text.includes(s))) return;
    this.problems.push(`${this.name}: ${text}`);
  }

  /** The live room state as this screen sees it (null before it has joined). */
  async state(): Promise<RoomState | null> {
    return this.page
      .evaluate(() => {
        const list = (window as unknown as { __ktClients?: Array<{ state: unknown; status: string }> }).__ktClients ?? [];
        const c = [...list].reverse().find((x) => x.state);
        return c ? JSON.parse(JSON.stringify(c.state)) : null;
      })
      .catch(() => null);
  }

  async connected(): Promise<boolean> {
    return this.page
      .evaluate(() => {
        const list = (window as unknown as { __ktClients?: Array<{ status: string }> }).__ktClients ?? [];
        return list.some((c) => c.status === "open");
      })
      .catch(() => false);
  }

  /** Room state, connection, countdown numbers and page text, all read in the same instant (so they can be compared). */
  async snapshot(): Promise<{ state: RoomState | null; open: boolean; countdowns: number[]; text: string; at: number } | null> {
    return this.page
      .evaluate(() => {
        const list = (window as unknown as { __ktClients?: Array<{ state: unknown; status: string }> }).__ktClients ?? [];
        const c = [...list].reverse().find((x) => x.state);
        const found: Element[] = [];
        const walk = (root: Document | ShadowRoot | Element) => {
          found.push(...root.querySelectorAll("[data-countdown]"));
          for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
        };
        walk(document);
        return {
          state: c ? JSON.parse(JSON.stringify(c.state)) : null,
          open: list.some((x) => x.status === "open"),
          countdowns: found
            .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
            .map((el) => Number(el.getAttribute("data-countdown"))),
          text: document.body.innerText,
          // The page's real time, even when a scenario made the phone's clock wrong on purpose (S41).
          at: ((window as unknown as { __realNow?: () => number }).__realNow ?? Date.now)(),
        };
      })
      .catch(() => null);
  }

  /** The countdown numbers this screen is showing right now (empty when none). */
  async countdowns(): Promise<number[]> {
    return this.page
      .evaluate(() => {
        // The TV's card sits in a shadow root, so look inside every one.
        const found: Element[] = [];
        const walk = (root: Document | ShadowRoot | Element) => {
          found.push(...root.querySelectorAll("[data-countdown]"));
          for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
        };
        walk(document);
        return found
          .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
          .map((el) => Number(el.getAttribute("data-countdown")));
      })
      .catch(() => []);
  }

  async bodyText(): Promise<string> {
    return this.page.evaluate(() => document.body.innerText).catch(() => "");
  }

  /** Sends a message to the room through this screen's own connection (what its buttons would send). */
  async send(msg: ClientMessage) {
    await this.page.evaluate((m) => {
      const list = (window as unknown as { __ktClients?: Array<{ state: unknown; send(m: unknown): void }> }).__ktClients ?? [];
      const c = [...list].reverse().find((x) => x.state);
      if (!c) throw new Error("no room connection on this page");
      c.send(m);
    }, msg);
  }

  /** Sends a message that should be refused; resolves with the error code the room answered with. */
  async expectRefused(msg: ClientMessage): Promise<ErrorCode> {
    const before = (await this.errors()).length;
    await this.send(msg);
    let code: string | undefined;
    await expect.poll(async () => (code = (await this.errors())[before]), { message: `${this.name}: the room answers with an error` }).toBeTruthy();
    return code as ErrorCode;
  }

  /** C7: reloads this screen and waits for it to be connected again with the same room state. */
  async reloadAndSettle() {
    const before = await this.state();
    await this.page.reload();
    await expect.poll(() => this.connected(), { message: `${this.name} reconnects after a reload`, timeout: 15_000 }).toBe(true);
    await expect
      .poll(async () => {
        const s = await this.state();
        return !!s && !!before && s.status === before.status && s.nowPlaying?.id === before.nowPlaying?.id && s.upNext.map((i) => i.id).join() === before.upNext.map((i) => i.id).join();
      }, { message: `${this.name} shows the same room after a reload`, timeout: 10_000 })
      .toBe(true);
  }

  async addSong(song: SongKey | Song, extra: { singerIds?: string[]; everyone?: boolean } = {}) {
    await this.send({ type: "add_song", song: typeof song === "string" ? SONGS[song] : song, ...extra });
  }

  /** Waits until the room state on this screen matches. */
  async waitForState(what: string, pred: (s: RoomState) => boolean, timeout = 15_000): Promise<RoomState> {
    let last: RoomState | null = null;
    try {
      await expect
        .poll(
          async () => {
            last = await this.state();
            return !!last && pred(last);
          },
          { timeout, message: `${this.name}: waiting for ${what}`, intervals: [100, 200, 300] },
        )
        .toBe(true);
    } catch (e) {
      throw new Error(`${(e as Error).message}\nlast state: ${JSON.stringify(summary(last))}`);
    }
    return last!;
  }

  /** Error codes the room has sent this screen so far (`not_allowed`, `queue_limit`…). */
  async errors(): Promise<string[]> {
    return this.page.evaluate(() => [...((window as unknown as { __ktErrors?: string[] }).__ktErrors ?? [])]).catch(() => []);
  }

  /** Reactions this screen's room connection has received so far. */
  async reactions(): Promise<Array<{ memberId: string; reaction: string }>> {
    return this.page
      .evaluate(() => {
        const list = (window as unknown as { __ktClients?: Array<{ state: unknown; __reactions?: unknown[] }> }).__ktClients ?? [];
        const c = [...list].reverse().find((x) => x.state);
        return JSON.parse(JSON.stringify(c?.__reactions ?? []));
      })
      .catch(() => []);
  }

  /** Closes this screen's tab and opens it again on the same address (a closed laptop lid, a killed tab): its storage stays. */
  async reopen() {
    const url = this.page.url();
    await this.page.close();
    this.page = await this.ctx.newPage();
    this.watchPage(this.page);
    await this.page.goto(url);
  }

  /** Cuts this browser's connection to the room (and refuses new ones) until `setNetwork(true)`. */
  setNetwork(online: boolean) {
    const net = nets.get(this.ctx);
    if (!net) throw new Error("this screen has no network control");
    net.offline = !online;
    if (!online) for (const ws of [...net.sockets]) void ws.close();
  }

  private awayUrl = "";
  /** Closes this screen's tab (a closed lid, a dead battery) and leaves its storage behind. */
  async goOffline() {
    this.awayUrl = this.page.url();
    await this.page.close();
  }
  /** Opens the screen again where it was (or on `url`). */
  async comeBack(url = this.awayUrl) {
    this.page = await this.ctx.newPage();
    this.watchPage(this.page);
    await this.page.goto(url);
  }

  async memberId(): Promise<string> {
    const id = await this.page.evaluate(() => {
      const list = (window as unknown as { __ktClients?: Array<{ me: { id: string } | null }> }).__ktClients ?? [];
      return [...list].reverse().find((c) => c.me)?.me?.id ?? null;
    });
    if (!id) throw new Error(`${this.name} has no member id yet`);
    return id;
  }

  async reload() {
    await this.page.reload();
  }

  async close() {
    await this.ctx.close().catch(() => {});
  }
}

/** "Ana:bohemian" for each song in a list (singers joined with +), for comparing queue orders. */
export function order(s: RoomState, items = s.upNext): string[] {
  const nick = (id: string) => s.members.find((m) => m.id === id)?.nickname ?? id.slice(0, 4);
  return items.map((i) => `${i.everyone ? "Everyone" : i.singerIds.map(nick).join("+")}:${i.song.videoId.replace(/^e2e-/, "")}`);
}

export function summary(s: RoomState | null) {
  if (!s) return null;
  return {
    status: s.status,
    playback: s.playback.state,
    endsIn: s.playback.countdownEndsAt ? s.playback.countdownEndsAt - Date.now() : null,
    now: s.nowPlaying ? `${s.nowPlaying.song.title} [${s.nowPlaying.singerIds.map((i) => nick(s, i)).join("+")}]` : null,
    next: s.upNext.map((i) => `${i.song.title} [${i.singerIds.map((x) => nick(s, x)).join("+")}]`),
    members: s.members.map((m) => `${m.nickname}${m.connected ? "" : "(off)"}:${m.role}`),
  };
}
const nick = (s: RoomState, id: string) => s.members.find((m) => m.id === id)?.nickname ?? id.slice(0, 4);

export class Host extends Person {}

export class Phone extends Person {
  /** Adds a song the way a guest does: Search tab, type, tap the song's add button. Needs a catalog title. */
  /** The phone's bottom tab bar: Home, Search, Queue, Party. */
  lang: "en" | "es" = "en";
  async tab(name: "Home" | "Search" | "Queue" | "Party") {
    const d = this.lang === "es" ? es : en;
    // (a tab can carry a badge in its name, so match by containing the label)
    await this.page.getByRole("navigation", { name: d["nav.main"] }).getByRole("button", { name: new RegExp(d[`tab.${name.toLowerCase()}` as "tab.home"]) }).click();
  }

  /** The Party tab → "Leave party" → confirm, the way a guest leaves. */
  async leaveViaUI() {
    await this.tab("Party");
    await this.page.getByRole("button", { name: "Leave party" }).click();
    await this.page.getByRole("button", { name: "Leave", exact: true }).click();
  }

  async addViaSearch(query: string, title: string) {
    await this.tab("Search");
    await this.page.getByPlaceholder("What do you want to sing?").fill(query);
    await this.page.getByRole("button", { name: `Add ${title} to queue`, exact: true }).first().click({ timeout: 20_000 });
  }
}

export class Tv extends Person {
  /** Changes the fake YouTube's behaviour (song length, failing videos…). */
  async fake(patch: Partial<FakeYTSettings>) {
    await this.page.evaluate((p) => {
      const s = (window as unknown as { __fakeYT: { settings: Record<string, unknown> } }).__fakeYT.settings;
      for (const [k, v] of Object.entries(p)) s[k] = typeof v === "object" && v ? { ...(s[k] as object), ...v } : v;
    }, patch);
  }
  /** Video ids the fake player was asked to load, in order. */
  async loads(): Promise<string[]> {
    return this.page.evaluate(() => (window as unknown as { __fakeYT: { loads: string[] } }).__fakeYT.loads);
  }
  /** Where the fake player is in the song, in seconds, and its state (1 playing, 2 paused…). */
  async player(): Promise<{ pos: number; state: number; video: string | null }> {
    return this.page.evaluate(() => {
      const p = (window as unknown as { __fakeYT: { current: any } }).__fakeYT.current;
      return p ? { pos: p.getCurrentTime(), state: p.getPlayerState(), video: p.videoId } : { pos: 0, state: -1, video: null };
    });
  }
  /** All the text on the TV, including what sits inside shadow roots (the get-ready card and the bar do). */
  async deepText(): Promise<string> {
    return this.page
      .evaluate(() => {
        const out: string[] = [];
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) out.push(node.textContent ?? "");
          else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
            if (el.shadowRoot) walk(el.shadowRoot);
          }
          for (const child of node.childNodes) walk(child);
        };
        walk(document.body);
        return out.join(" ").replace(/\s+/g, " ");
      })
      .catch(() => "");
  }

  /** Is the join QR + code on screen (the lobby, the get-ready card, or over a song)? */
  async joinCardVisible(): Promise<boolean> {
    return this.page.evaluate(() => {
      const hit = (root: Document | ShadowRoot): boolean => {
        for (const el of root.querySelectorAll(".kt-tv-code, [data-testid=tv-lobby-code]")) if (el.getClientRects().length > 0) return true;
        for (const el of root.querySelectorAll("*")) if (el.shadowRoot && hit(el.shadowRoot)) return true;
        return false;
      };
      return hit(document);
    });
  }
  async pressStart() {
    await this.page.getByTestId("tv-start").click();
  }
}

export const PHONE = { ...devices["Pixel 7"], locale: "en-US" };
export const DESKTOP = { viewport: { width: 1280, height: 800 }, locale: "en-US" };

// Chrome keeps open WebSockets alive when it is told to go offline, so the "network" is faked at the socket instead:
// every room connection goes through here, and `setNetwork(false)` cuts them and refuses new ones until it is back.
type Net = { offline: boolean; sockets: Set<WebSocketRoute> };
const nets = new WeakMap<BrowserContext, Net>();

export async function newContext(browser: Browser, opts: Parameters<Browser["newContext"]>[0]) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(installFakeYT);
  const net: Net = { offline: false, sockets: new Set() };
  nets.set(ctx, net);
  await ctx.routeWebSocket(/\/api\/rooms\/[^/]+\/ws/, (ws) => {
    if (net.offline) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    net.sockets.add(ws);
    ws.onClose(() => net.sockets.delete(ws));
  });
  return ctx;
}
