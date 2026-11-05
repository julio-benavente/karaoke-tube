import { DurableObject } from "cloudflare:workers";
import {
  AWARDS,
  DEFAULT_SETTINGS,
  REACTIONS,
  type Award,
  type AwardWindow,
  type ClientMessage,
  type CreateRoomResponse,
  type ErrorCode,
  type Member,
  type PartyLogEntry,
  type Playback,
  type QueueItem,
  type Recap,
  type RecapPerformance,
  type Role,
  type RoomInfoResponse,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
  type Song,
  SCREEN_MEMBER_ID,
} from "@karaoke-tube/shared";
import { orderUpNext, shiftPins, turnHolders, type StoredItem } from "../queue";
import { computeTitles } from "../titles";

/** Storage is deleted this long after the party ends. */
export const ENDED_TTL_MS = 60 * 60 * 1000;
/** Each member may send one reaction per this many ms. */
export const REACTION_INTERVAL_MS = 500;
/** Most guests without a phone a host can add. */
const MAX_PHONELESS = 30;

/** How long after a performance members can give it awards. */
export const AWARD_WINDOW_MS = 60 * 1000;
/** Recaps stay readable at /recap/:id this long. */
export const RECAP_TTL_SEC = 30 * 24 * 60 * 60;
/** While the real host is away: who is standing in, who the real host is, and what the stand-in was before. */
type Succession = { originalId: string; actingId: string; actingWas: "cohost" | "guest" };

/** The host has been offline this long: the co-host (or else a guest who is here) takes over. */
const HOST_OFFLINE_MS = 60_000;

/** An open party with nobody connected for this long ends itself. */
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_NICKNAME = 24;

/** Kept on each socket with `serializeAttachment`, so it survives hibernation. */
type Attachment = { memberId: string | null; wantsPlayer: boolean; player: boolean };

/** A member's part in a party, for the account party log. */
export type MemberSummary = Omit<PartyLogEntry, never>;

type MemberRow = {
  id: string;
  nickname: string;
  avatar_seed: string;
  role: Role;
  joined_at: number;
  key_hash: string;
  /** 1 = added by a host, has no phone. */
  phoneless?: number;
};

type ItemRow = {
  id: string;
  song: string;
  singer_ids: string;
  added_by: string;
  status: QueueItem["status"];
  added_at: number;
  started_at: number | null;
  pin_index: number | null;
  everyone: number;
  performed_at: number | null;
};

export class RoomError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One instance per room. State lives in the DO's SQLite storage and sockets use the
 * WebSocket Hibernation API, so idle rooms cost (almost) nothing.
 */
export class Room extends DurableObject<Env> {
  private sql: SqlStorage;
  /** Last reaction time per member. In memory only: losing it on hibernation is harmless. */
  private lastReaction = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Heartbeat: clients send "ping" and get "pong" without waking the object, so a socket left half-open by a
    // sleeping laptop or phone is noticed and replaced.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY, nickname TEXT NOT NULL, avatar_seed TEXT NOT NULL, role TEXT NOT NULL,
        joined_at INTEGER NOT NULL, key_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, song TEXT NOT NULL, singer_ids TEXT NOT NULL, added_by TEXT NOT NULL,
        status TEXT NOT NULL, added_at INTEGER NOT NULL, started_at INTEGER, pin_index INTEGER
      );
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS awards (
        item_id TEXT NOT NULL, member_id TEXT NOT NULL, award TEXT NOT NULL, at INTEGER NOT NULL,
        PRIMARY KEY (item_id, member_id)
      );
      CREATE TABLE IF NOT EXISTS cheers (
        item_id TEXT NOT NULL, member_id TEXT NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY (item_id, member_id)
      );
    `);
    // v1.1 columns, added to rooms created before them.
    for (const column of ["everyone INTEGER NOT NULL DEFAULT 0", "performed_at INTEGER"]) {
      try {
        this.sql.exec(`ALTER TABLE items ADD COLUMN ${column}`);
      } catch {
        // already there
      }
    }
    try {
      this.sql.exec("ALTER TABLE members ADD COLUMN phoneless INTEGER NOT NULL DEFAULT 0");
    } catch {
      // already there
    }
  }

  // ── RPC from the Worker ────────────────────────────────────────────────

  /** Sets up a new room with its host. Returns null when the code is already in use. */
  async init(code: string, nickname: string, avatarSeed: string, settings?: Partial<RoomSettings>): Promise<CreateRoomResponse | null> {
    if (this.getMeta("code") !== null) return null;
    this.setMeta("code", code);
    this.setMeta("status", "open");
    // `settings` = the host account's saved room settings (accounts are optional; guests get the defaults).
    this.setMeta("settings", { ...DEFAULT_SETTINGS, ...(settings ? sanitizeSettings(settings) : {}) });
    this.setMeta("playback", idlePlayback());
    const { memberId, key } = await this.addMember(nickname, avatarSeed, "host");
    // Nobody is connected yet: if the host never shows up, the idle clock still ends the party.
    this.setMeta("idleSince", Date.now());
    await this.scheduleAlarm();
    return { code, memberId, key };
  }

  /**
   * For an account's party log: what this member did, checked against their room key (null = not a member / bad key).
   * Songs sung and titles come from the recap once the party has ended; while it is open, from played songs.
   */
  async memberSummary(memberId: string, key: string): Promise<MemberSummary | null> {
    if (this.getMeta("code") === null) return null;
    const member = this.memberRow(memberId);
    if (!member || member.key_hash !== (await sha256(key))) return null;
    const recap = this.getMeta<Recap>("recap");
    const mine = recap
      ? recap.performances.filter((p) => p.item.singerIds.includes(memberId))
      : this.itemRows()
          .filter((i) => i.status === "played" && i.singerIds.includes(memberId))
          .map((i) => ({ item: publicItem(i), cheers: 0, awards: {} }) as RecapPerformance);
    const top = mine.reduce<RecapPerformance | null>((best, p) => (p.cheers > (best?.cheers ?? -1) ? p : best), null);
    return {
      code: this.getMeta<string>("code") ?? "",
      role: member.role,
      joinedAt: member.joined_at,
      endedAt: recap?.endedAt ?? null,
      recapId: recap?.id ?? null,
      songsSung: mine.length,
      cheers: mine.reduce((n, p) => n + p.cheers, 0),
      titles: recap?.titles[memberId] ?? [],
      members: this.memberRows().length,
      topSong: top?.item.song ?? null,
    };
  }

  async info(): Promise<RoomInfoResponse> {
    const code = this.getMeta<string>("code");
    if (code === null) return { code: "", exists: false, locked: false, status: null };
    return { code, exists: true, locked: this.settings().locked, status: this.status() };
  }

  // ── WebSocket ──────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const wantsPlayer = new URL(request.url).searchParams.get("player") === "1";
    server.serializeAttachment({ memberId: null, wantsPlayer, player: false } satisfies Attachment);
    if (this.getMeta("code") === null) {
      this.send(server, { type: "error", code: "room_not_found", message: "This room doesn't exist." });
      server.close(4004, "room_not_found");
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: ClientMessage;
    try {
      msg = parseClientMessage(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch (e) {
      this.send(ws, { type: "error", code: "invalid_message", message: e instanceof Error ? e.message : "Invalid message" });
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (e) {
      if (e instanceof RoomError) {
        this.send(ws, { type: "error", code: e.code, message: e.message });
      } else {
        console.error("[room] handler failed", e);
        this.send(ws, { type: "error", code: "invalid_message", message: "Something went wrong" });
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      // 1005/1006 are reserved codes a client can report but we can't send back.
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
    await this.onSocketGone(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.onSocketGone(ws);
  }

  /** A member's socket closed: update `connected`, and start the idle clock when nobody is left. */
  private async onSocketGone(ws: WebSocket) {
    if (!attachment(ws).memberId) return;
    this.broadcastState(ws);
    await this.checkHostPresence(ws);
    const anyoneLeft = this.ctx.getWebSockets().some((s) => s !== ws && attachment(s).memberId && attachment(s).memberId !== SCREEN_MEMBER_ID);
    if (!anyoneLeft && this.getMeta("code") !== null && this.status() === "open") {
      this.setMeta("idleSince", Date.now());
      await this.scheduleAlarm();
    }
  }

  // ── Alarm ──────────────────────────────────────────────────────────────
  // One alarm per Durable Object, so it serves three deadlines: the get-ready countdown, the idle expiry
  // of an abandoned party, and deleting storage after the party ended. `scheduleAlarm` sets the earliest.

  async alarm() {
    const now = Date.now();
    if (this.status() === "ended") {
      const endedAt = this.getMeta<number>("endedAt") ?? 0;
      if (now >= endedAt + ENDED_TTL_MS) {
        for (const ws of this.ctx.getWebSockets()) ws.close(1000, "room deleted");
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
        return;
      }
      await this.scheduleAlarm();
      return;
    }
    // The get-ready countdown is over: tell the player to load the song.
    if (this.getMeta<boolean>("countdownPending")) {
      this.setMeta("countdownPending", false);
      const item = this.nowPlayingItem();
      if (item && this.playback().state === "get_ready") this.sendPlay(item);
    }
    // The host has been offline for a while and someone else is here: hand the party over.
    const hostOfflineSince = this.getMeta<number>("hostOfflineSince");
    if (hostOfflineSince && now >= hostOfflineSince + HOST_OFFLINE_MS) {
      this.setMeta("hostOfflineSince", null);
      if (this.succeedHost()) this.broadcastState();
    }
    // Nobody has been connected for IDLE_TTL_MS: the party was abandoned.
    const idleSince = this.getMeta<number>("idleSince");
    const anyone = this.ctx.getWebSockets().some((s) => attachment(s).memberId && attachment(s).memberId !== SCREEN_MEMBER_ID);
    if (idleSince && !anyone && now >= idleSince + IDLE_TTL_MS) {
      console.log("[room] ending an abandoned party");
      await this.endRoom();
      return;
    }
    await this.scheduleAlarm();
  }

  /**
   * Takes a member's songs out of the party: waiting and pending songs go (a duet stays if another singer is left),
   * and if they are the only singer on screen that song is skipped.
   */
  private async removeMemberSongs(memberId: string) {
    const waiting = [...this.upNext(), ...this.itemRows().filter((i) => i.status === "pending")];
    for (const item of waiting) {
      if (!item.singerIds.includes(memberId)) continue;
      const rest = item.singerIds.filter((id) => id !== memberId);
      if (rest.length === 0) this.sql.exec("DELETE FROM items WHERE id = ?", item.id);
      else this.sql.exec("UPDATE items SET singer_ids = ? WHERE id = ?", JSON.stringify(rest), item.id);
    }
    this.normalisePins();
    const current = this.nowPlayingItem();
    if (current && current.singerIds.length === 1 && current.singerIds[0] === memberId) {
      this.setItem(current.id, { status: "skipped" });
      await this.advance();
      if (!this.nowPlayingItem()) this.sendToPlayer({ type: "player_command", command: "pause" });
    }
  }

  /**
   * The host app pairs a TV: only the host (including a temporary host) can. Returns the screen's key, which the
   * TV keeps; any earlier screen is dropped, so there is one screen per party.
   */
  async pairScreen(memberId: string, key: string): Promise<string | null> {
    if (this.getMeta("code") === null || this.status() !== "open") return null;
    const member = this.memberRow(memberId);
    if (!member || member.role !== "host" || member.key_hash !== (await sha256(key))) return null;
    this.dropScreenSockets();
    const screenKey = randomKey();
    this.setMeta("screenKeyHash", await sha256(screenKey));
    this.setMeta("playerTabOpen", false);
    this.broadcastState();
    return screenKey;
  }

  /** Unpairs the TV: its key stops working and it is told to go back to showing a pairing code. */
  private dropScreen() {
    this.dropScreenSockets();
    this.setMeta("screenKeyHash", null);
    this.setMeta("playerTabOpen", false);
  }

  private dropScreenSockets() {
    for (const sock of this.socketsOf(SCREEN_MEMBER_ID)) {
      this.send(sock, { type: "screen_removed" });
      sock.serializeAttachment({ memberId: null, wantsPlayer: false, player: false } satisfies Attachment);
      sock.close(1000, "screen removed");
    }
  }

  /** The TV connects with its screen key (as the reserved member id). It becomes the party's player. */
  private async onScreenRejoin(ws: WebSocket, key: string) {
    const hash = this.getMeta<string>("screenKeyHash");
    if (!hash || hash !== (await sha256(key))) throw new RoomError("bad_key", "This screen isn't paired any more.");
    for (const other of this.ctx.getWebSockets()) {
      const o = attachment(other);
      if (other !== ws && o.player) other.serializeAttachment({ ...o, player: false } satisfies Attachment);
    }
    ws.serializeAttachment({ memberId: SCREEN_MEMBER_ID, wantsPlayer: true, player: true } satisfies Attachment);
    this.send(ws, { type: "welcome", memberId: SCREEN_MEMBER_ID, key, state: this.state() });
    await this.afterRejoin(ws);
  }

  /** Is anyone connected as this member? `closing` is a socket that's going away and doesn't count. */
  private isOnline(memberId: string, closing?: WebSocket, ignorePlayer = false): boolean {
    return this.ctx.getWebSockets().some((s) => {
      if (s === closing || attachment(s).memberId !== memberId) return false;
      return !(ignorePlayer && attachment(s).player); // a TV window opened with the host's login isn't the host
    });
  }

  /** Starts or stops the "host is offline" clock. It only runs while somebody else is here to take over. */
  private async checkHostPresence(closing?: WebSocket) {
    if (this.status() !== "open") return;
    const host = this.memberRows().find((m) => m.role === "host");
    if (!host) return;
    const since = this.getMeta<number>("hostOfflineSince");
    const othersHere = this.memberRows().some((m) => m.id !== host.id && !m.phoneless && this.isOnline(m.id, closing));
    if (this.isOnline(host.id, closing, true) || !othersHere) {
      if (since !== null) {
        this.setMeta("hostOfflineSince", null);
        await this.scheduleAlarm();
      }
      return;
    }
    if (since === null) {
      this.setMeta("hostOfflineSince", Date.now());
      await this.scheduleAlarm();
    }
  }

  /**
   * The host has been gone too long: the co-host who is here (earliest first), else the guest who has been here
   * longest, becomes the temporary host. The real host is remembered and gets the role back as soon as they return.
   */
  private succeedHost(): boolean {
    const host = this.memberRows().find((m) => m.role === "host");
    const next = this.memberRows()
      .filter((m) => m.role !== "host" && !m.phoneless && this.isOnline(m.id))
      .sort((a, b) => Number(b.role === "cohost") - Number(a.role === "cohost") || a.joined_at - b.joined_at)[0];
    if (!host || !next) return false;
    const before = this.getMeta<Succession>("succession");
    let originalId = host.id;
    if (before && before.actingId === host.id) {
      // The temporary host went offline too: they go back to what they were, the real host's seat stays reserved.
      originalId = before.originalId;
      this.sql.exec("UPDATE members SET role = ? WHERE id = ?", before.actingWas, host.id);
    } else {
      // The real host waits as a co-host until they are back.
      this.sql.exec("UPDATE members SET role = 'cohost' WHERE id = ?", host.id);
    }
    this.sql.exec("UPDATE members SET role = 'host' WHERE id = ?", next.id);
    this.setMeta("succession", { originalId, actingId: next.id, actingWas: next.role === "cohost" ? "cohost" : "guest" } satisfies Succession);
    return true;
  }

  /** The real host is back: they are the host again and the temporary host returns to their previous role. */
  private restoreHost(memberId: string): boolean {
    const s = this.getMeta<Succession>("succession");
    if (!s || s.originalId !== memberId) return false;
    if (this.memberRow(s.actingId)) this.sql.exec("UPDATE members SET role = ? WHERE id = ?", s.actingWas, s.actingId);
    this.sql.exec("UPDATE members SET role = 'host' WHERE id = ?", memberId);
    this.setMeta("succession", null);
    return true;
  }

  /** Sets the alarm to the earliest pending deadline, or clears it. */
  private async scheduleAlarm() {
    const times: number[] = [];
    if (this.status() === "ended") {
      times.push((this.getMeta<number>("endedAt") ?? Date.now()) + ENDED_TTL_MS);
    } else {
      const pb = this.playback();
      if (this.getMeta<boolean>("countdownPending") && pb.state === "get_ready" && pb.countdownEndsAt) times.push(pb.countdownEndsAt);
      const idleSince = this.getMeta<number>("idleSince");
      if (idleSince) times.push(idleSince + IDLE_TTL_MS);
      const hostOfflineSince = this.getMeta<number>("hostOfflineSince");
      if (hostOfflineSince) times.push(hostOfflineSince + HOST_OFFLINE_MS);
    }
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }

  /** End the party: status ended, tell everyone, delete storage after ENDED_TTL_MS. */
  private async endRoom() {
    const now = Date.now();
    // The song on screen when the party ends still counts as sung if it started.
    const current = this.nowPlayingItem();
    if (current) this.setItem(current.id, { status: current.performedAt !== null ? "played" : "skipped" });
    this.sql.exec("DELETE FROM items WHERE status IN ('waiting', 'pending')");
    this.setMeta("status", "ended");
    this.setMeta("endedAt", now);
    this.setMeta("countdownPending", false);
    this.setMeta("awardWindow", null);
    this.setPlayback(idlePlayback(now));
    await this.saveRecap(now);
    await this.scheduleAlarm();
    this.broadcastState();
    this.broadcast({ type: "ended" });
  }

  // ── Message handling ───────────────────────────────────────────────────

  private async handle(ws: WebSocket, msg: ClientMessage) {
    if (msg.type === "join") return this.onJoin(ws, msg.nickname, msg.avatarSeed);
    if (msg.type === "rejoin") return this.onRejoin(ws, msg.memberId, msg.key);

    if (attachment(ws).memberId === SCREEN_MEMBER_ID) {
      // A paired TV screen is not a member: it can only report on the video it plays.
      if (this.status() === "ended") return;
      if (msg.type === "player_event") return this.onPlayerEvent(ws, msg);
      if (msg.type === "player_status") {
        this.setMeta("playerTabOpen", msg.tabOpen);
        this.broadcastState();
        return;
      }
      throw new RoomError("not_allowed", "A TV screen can't do that.");
    }
    const me = this.currentMember(ws);
    if (this.status() === "ended") throw new RoomError("room_ended", "The party has ended.");
    const isHost = me.role === "host" || me.role === "cohost";
    const requireHost = () => {
      if (!isHost) throw new RoomError("not_allowed", "Only hosts can do that.");
    };

    switch (msg.type) {
      case "add_song": {
        const settings = this.settings();
        if (settings.hostsOnlyAdd) requireHost();
        const members = new Set(this.memberRows().map((m) => m.id));
        const everyone = msg.everyone === true;
        // A group song is the adder's turn; a duet is a turn for each singer.
        const singerIds = everyone ? [me.id] : msg.singerIds && msg.singerIds.length > 0 ? [...new Set(msg.singerIds)] : [me.id];
        if (singerIds.some((id) => !members.has(id))) throw new RoomError("not_allowed", "Unknown singer.");
        if ((everyone || singerIds.length > 1) && !settings.duets) {
          throw new RoomError("not_allowed", "The host turned duets and group songs off.");
        }
        if (!isHost && !singerIds.includes(me.id)) throw new RoomError("not_allowed", "You can only add songs you sing in.");
        if (!isHost) {
          const waiting = this.itemRows().filter(
            (i) => (i.status === "waiting" || i.status === "pending") && turnHolders(i).includes(me.id),
          ).length;
          if (waiting >= settings.maxWaitingPerMember) {
            throw new RoomError("queue_limit", `You already have ${waiting} song${waiting === 1 ? "" : "s"} waiting.`);
          }
        }
        // "Host picks": guests' songs wait for a host's OK.
        const status = settings.queueMode === "approval" && !isHost ? "pending" : "waiting";
        const s = msg.song;
        const song: Song = { videoId: s.videoId, title: s.title, channel: s.channel, durationSec: s.durationSec, thumbnailUrl: s.thumbnailUrl };
        this.sql.exec(
          "INSERT INTO items (id, song, singer_ids, added_by, status, added_at, started_at, pin_index, everyone) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
          crypto.randomUUID(),
          JSON.stringify(song),
          JSON.stringify(singerIds),
          me.id,
          status,
          this.nextAddedAt(),
          everyone ? 1 : 0,
        );
        await this.afterQueueChange();
        break;
      }
      case "approve_song":
      case "decline_song": {
        requireHost();
        const item = this.itemRows().find((i) => i.id === msg.itemId && i.status === "pending");
        if (!item) throw new RoomError("not_allowed", "That song isn't waiting for approval.");
        if (msg.type === "approve_song") {
          this.setItem(item.id, { status: "waiting" });
          await this.afterQueueChange();
        } else {
          this.sql.exec("DELETE FROM items WHERE id = ?", item.id);
        }
        break;
      }
      case "give_award": {
        this.giveAward(me, msg.itemId, msg.award);
        break;
      }
      case "remove_song": {
        const pendingItem = this.itemRows().find((i) => i.id === msg.itemId && i.status === "pending");
        if (pendingItem) {
          if (!isHost && pendingItem.addedBy !== me.id) throw new RoomError("not_allowed", "You can only remove your own songs.");
          this.sql.exec("DELETE FROM items WHERE id = ?", pendingItem.id);
          break;
        }
        const upNext = this.upNext();
        const index = upNext.findIndex((i) => i.id === msg.itemId);
        if (index === -1) throw new RoomError("not_allowed", "That song isn't waiting in the queue.");
        const item = upNext[index]!;
        if (!isHost && item.addedBy !== me.id && !item.singerIds.includes(me.id)) {
          throw new RoomError("not_allowed", "You can only remove your own songs.");
        }
        this.sql.exec("DELETE FROM items WHERE id = ?", item.id);
        this.applyPinShift(upNext, index);
        break;
      }
      case "move_song": {
        requireHost();
        const upNext = this.upNext();
        const moved = upNext.find((i) => i.id === msg.itemId);
        if (!moved) throw new RoomError("not_allowed", "That song isn't waiting in the queue.");
        const toIndex = Math.max(0, Math.min(Math.trunc(msg.toIndex), upNext.length - 1));
        // Freeze the order the host sees, then move the item: each waiting item keeps its place until it plays.
        const order = upNext.filter((i) => i !== moved);
        order.splice(toIndex, 0, moved);
        order.forEach((item, index) => this.sql.exec("UPDATE items SET pin_index = ? WHERE id = ?", index, item.id));
        break;
      }
      case "set_role": {
        if (me.role !== "host") throw new RoomError("not_allowed", "Only the host can change roles.");
        const target = this.memberRow(msg.memberId);
        if (!target || target.role === "host") throw new RoomError("not_allowed", "Can't change that member's role.");
        if (target.phoneless) throw new RoomError("not_allowed", "A guest without a phone can't be a co-host.");
        this.sql.exec("UPDATE members SET role = ? WHERE id = ?", msg.role, target.id);
        break;
      }
      case "kick": {
        requireHost();
        const target = this.memberRow(msg.memberId);
        if (!target || target.role === "host" || target.id === me.id) throw new RoomError("not_allowed", "Can't remove that member.");
        if (me.role === "cohost" && target.role === "cohost") throw new RoomError("not_allowed", "Only the host can remove a co-host.");
        await this.removeMemberSongs(target.id);
        this.sql.exec("DELETE FROM members WHERE id = ?", target.id);
        for (const sock of this.socketsOf(target.id)) {
          this.send(sock, { type: "kicked" });
          sock.serializeAttachment({ memberId: null, wantsPlayer: false, player: false } satisfies Attachment);
          sock.close(4000, "kicked");
        }
        break;
      }
      case "leave": {
        if (this.status() === "ended") return; // the party is over: nothing to leave (the recap keeps its members)
        // The host leaving on purpose ends the party. Anyone else leaves cleanly: their songs go with them.
        const succession = this.getMeta<Succession>("succession");
        if (me.role === "host" && succession?.actingId === me.id) {
          // A temporary host leaving just gives the seat back; the party goes on for the real host.
          this.sql.exec("UPDATE members SET role = 'host' WHERE id = ?", succession.originalId);
          this.setMeta("succession", null);
        } else if (me.role === "host") {
          await this.endRoom();
          return;
        }
        await this.removeMemberSongs(me.id);
        this.sql.exec("DELETE FROM members WHERE id = ?", me.id);
        for (const sock of this.socketsOf(me.id)) {
          sock.serializeAttachment({ memberId: null, wantsPlayer: false, player: false } satisfies Attachment);
          sock.close(1000, "left");
        }
        await this.checkHostPresence();
        break;
      }
      case "remove_member_songs": {
        // Hosts: clear everything a member still has in the queue (e.g. they went offline and won't be back).
        requireHost();
        const target = this.memberRow(msg.memberId);
        if (!target) throw new RoomError("not_allowed", "Unknown member.");
        await this.removeMemberSongs(target.id);
        break;
      }
      case "remove_screen": {
        if (me.role !== "host") throw new RoomError("not_allowed", "Only the host can remove the TV screen.");
        this.dropScreen();
        break;
      }
      case "update_settings": {
        requireHost();
        const next = { ...this.settings(), ...sanitizeSettings(msg.settings) };
        this.setMeta("settings", next);
        // Leaving "Host picks": every pending song gets in.
        if (next.queueMode !== "approval") {
          this.sql.exec("UPDATE items SET status = 'waiting' WHERE status = 'pending'");
          await this.afterQueueChange();
        }
        break;
      }
      case "add_guest": {
        requireHost();
        const count = this.memberRows().filter((m) => m.phoneless).length;
        if (count >= MAX_PHONELESS) throw new RoomError("not_allowed", "That's a lot of guests without phones.");
        await this.addMember(msg.nickname, msg.avatarSeed, "guest", true);
        break;
      }
      case "show_join": {
        requireHost();
        this.broadcast({ type: "join_flash" });
        return;
      }
      case "end_party": {
        if (me.role !== "host") throw new RoomError("not_allowed", "Only the host can end the party.");
        await this.endRoom();
        return;
      }
      case "player_status": {
        if (!this.isPlayer(ws)) throw new RoomError("not_allowed", "Only the party's player can send this.");
        this.setMeta("playerTabOpen", msg.tabOpen);
        break;
      }
      case "react": {
        if (!this.settings().reactions) throw new RoomError("not_allowed", "Reactions are off.");
        const now = Date.now();
        if (now - (this.lastReaction.get(me.id) ?? 0) < REACTION_INTERVAL_MS) return; // dropped
        this.lastReaction.set(me.id, now);
        // Count it toward the performance on screen (for the end-of-night titles).
        const current = this.nowPlayingItem();
        if (current && current.performedAt !== null) this.countCheer(current.id, me.id);
        this.broadcast({ type: "reaction", memberId: me.id, reaction: msg.reaction });
        return;
      }
      default: {
        await this.handlePlayback(ws, isHost, msg);
        return;
      }
    }
    this.broadcastState();
  }

  // ── Playback ───────────────────────────────────────────────────────────

  private async handlePlayback(ws: WebSocket, isHost: boolean, msg: ClientMessage) {
    if (msg.type === "player_event") return this.onPlayerEvent(ws, msg);
    if (!isHost) throw new RoomError("not_allowed", "Only hosts can do that.");
    const item = this.nowPlayingItem();
    const pb = this.playback();
    const now = Date.now();
    switch (msg.type) {
      case "skip":
        if (!item) break;
        this.setItem(item.id, { status: "skipped" });
        this.openAwardWindow(item);
        await this.advance();
        // Nothing left: stop the video that's still on screen.
        if (!this.nowPlayingItem()) this.sendToPlayer({ type: "player_command", command: "pause" });
        break;
      case "pause":
        if (pb.state !== "playing") break;
        this.setPlayback({ state: "paused", positionSec: position(pb, now), updatedAt: now, countdownEndsAt: null });
        this.sendToPlayer({ type: "player_command", command: "pause" });
        break;
      case "resume":
        if (pb.state !== "paused") break;
        this.setPlayback({ ...pb, state: "playing", updatedAt: now });
        this.sendToPlayer({ type: "player_command", command: "resume" });
        break;
      case "restart":
        if (!item || pb.state === "get_ready") break;
        this.setPlayback({ ...pb, positionSec: 0, updatedAt: now });
        this.sendToPlayer({ type: "player_command", command: "restart" });
        break;
      default:
        throw new RoomError("invalid_message", "Unknown message.");
    }
    this.broadcastState();
  }

  private async onPlayerEvent(ws: WebSocket, msg: Extract<ClientMessage, { type: "player_event" }>) {
    if (!this.isPlayer(ws)) throw new RoomError("not_allowed", "Only the party's player can send player events.");
    const item = this.nowPlayingItem();
    if (!item || item.id !== msg.itemId) return; // late event for a song that's already gone
    const pb = this.playback();
    const now = Date.now();
    const positionSec = Math.max(0, msg.positionSec ?? 0);
    // Songs from a pasted link without an API key arrive with an unknown length; the player knows it.
    if (item.song.durationSec === 0 && msg.durationSec && Number.isFinite(msg.durationSec) && msg.durationSec > 0) {
      const song: Song = { ...item.song, durationSec: Math.round(msg.durationSec) };
      this.sql.exec("UPDATE items SET song = ? WHERE id = ?", JSON.stringify(song), item.id);
    }
    // The song really got going: it counts as a performance (awards, titles).
    if ((msg.event === "started" || msg.event === "progress") && item.performedAt === null) {
      this.sql.exec("UPDATE items SET performed_at = ? WHERE id = ?", now, item.id);
      item.performedAt = now;
    }
    switch (msg.event) {
      case "started":
        this.setPlayback({ state: "playing", positionSec, updatedAt: now, countdownEndsAt: null });
        break;
      case "progress":
        if (pb.state === "get_ready") this.setPlayback({ state: "playing", positionSec, updatedAt: now, countdownEndsAt: null });
        else this.setPlayback({ ...pb, positionSec, updatedAt: now });
        break;
      case "ended":
        this.setItem(item.id, { status: "played" });
        this.openAwardWindow(item);
        await this.advance();
        break;
      case "error":
        this.setItem(item.id, { status: "skipped" });
        this.notifyUnplayable(item);
        this.openAwardWindow(item);
        await this.advance();
        break;
    }
    this.broadcastState();
  }

  /**
   * Starts the next song when nothing is playing: either the get-ready countdown (then `play` from the alarm)
   * or `play` right away. With an empty queue, playback goes idle.
   */
  private async advance() {
    if (this.nowPlayingItem() || this.status() === "ended") return;
    const upNext = this.upNext();
    const next = upNext[0];
    const now = Date.now();
    if (!next) {
      this.setPlayback(idlePlayback(now));
      this.setMeta("countdownPending", false);
      return;
    }
    this.setItem(next.id, { status: "playing", startedAt: now, pinIndex: null });
    this.applyPinShift(upNext, 0);
    const { getReadyCard, countdownSec } = this.settings();
    if (getReadyCard && countdownSec > 0) {
      const countdownEndsAt = now + countdownSec * 1000;
      this.setPlayback({ state: "get_ready", positionSec: 0, updatedAt: now, countdownEndsAt });
      this.setMeta("countdownPending", true);
      await this.scheduleAlarm();
    } else {
      this.setPlayback({ state: "playing", positionSec: 0, updatedAt: now, countdownEndsAt: null });
      this.setMeta("countdownPending", false);
      this.sendPlay({ ...next, status: "playing" });
    }
  }

  private sendPlay(item: StoredItem) {
    this.sendToPlayer({ type: "play", item: publicItem(item) });
  }

  private sendToPlayer(msg: ServerMessage) {
    const player = this.playerSocket();
    if (player) this.send(player, msg);
  }

  /** A song was added: start it if nothing is playing. */
  private async afterQueueChange() {
    await this.advance();
  }

  /** A reconnecting player gets the current song again (it ignores a song it's already on). */
  private async afterRejoin(ws: WebSocket) {
    if (!this.isPlayer(ws)) return;
    const item = this.nowPlayingItem();
    const pb = this.playback();
    if (!item) return;
    if (pb.state === "get_ready" && pb.countdownEndsAt !== null && pb.countdownEndsAt > Date.now()) return;
    this.sendPlay(item);
    if (pb.state === "paused") this.sendToPlayer({ type: "player_command", command: "pause" });
  }

  private async onJoin(ws: WebSocket, nickname: string, avatarSeed: string) {
    if (attachment(ws).memberId) throw new RoomError("invalid_message", "Already joined.");
    if (this.status() === "ended") throw new RoomError("room_ended", "The party has ended.");
    if (this.settings().locked) throw new RoomError("room_locked", "The host has locked this room.");
    const { memberId, key } = await this.addMember(nickname, avatarSeed, "guest");
    this.attach(ws, memberId);
    this.send(ws, { type: "welcome", memberId, key, state: this.state() });
    this.broadcastState(undefined, ws);
    await this.markActive();
  }

  /** Someone is connected again: stop the idle clock. */
  private async markActive() {
    if (this.getMeta<number>("idleSince") !== null) {
      this.setMeta("idleSince", null);
      await this.scheduleAlarm();
    }
    await this.checkHostPresence();
  }

  private async onRejoin(ws: WebSocket, memberId: string, key: string) {
    if (memberId === SCREEN_MEMBER_ID) return this.onScreenRejoin(ws, key);
    const member = this.memberRow(memberId);
    if (!member || member.key_hash !== (await sha256(key))) throw new RoomError("bad_key", "Can't rejoin; join again.");
    // The real host is back: they are the host again (before their welcome, so they see the right role).
    this.restoreHost(memberId);
    this.attach(ws, memberId);
    this.send(ws, { type: "welcome", memberId, key, state: this.state() });
    this.broadcastState(undefined, ws);
    await this.markActive();
    await this.afterRejoin(ws);
  }

  private attach(ws: WebSocket, memberId: string) {
    const att = attachment(ws);
    const player = att.wantsPlayer && this.memberRow(memberId)?.role === "host";
    if (player) {
      // Only one player: the newest one wins.
      for (const other of this.ctx.getWebSockets()) {
        const o = attachment(other);
        if (other !== ws && o.player) other.serializeAttachment({ ...o, player: false } satisfies Attachment);
      }
    }
    ws.serializeAttachment({ memberId, wantsPlayer: att.wantsPlayer, player } satisfies Attachment);
  }

  private async addMember(nickname: string, avatarSeed: string, role: Role, phoneless = false) {
    const memberId = crypto.randomUUID();
    const key = randomKey();
    this.sql.exec(
      "INSERT INTO members (id, nickname, avatar_seed, role, joined_at, key_hash, phoneless) VALUES (?, ?, ?, ?, ?, ?, ?)",
      memberId,
      this.uniqueNickname(nickname),
      avatarSeed.slice(0, 64),
      role,
      Date.now(),
      await sha256(key),
      phoneless ? 1 : 0,
    );
    return { memberId, key };
  }

  private uniqueNickname(raw: string): string {
    const base = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NICKNAME) || "Singer";
    const taken = new Set(this.memberRows().map((m) => m.nickname.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** `addedAt` for a new item: now, but always after the last item so the order is stable within a millisecond. */
  private nextAddedAt(): number {
    const last = this.sql.exec<{ t: number | null }>("SELECT MAX(added_at) AS t FROM items").one().t ?? 0;
    return Math.max(Date.now(), last + 1);
  }

  // ── v1.1: awards, cheers, recap ────────────────────────────────────────

  /** A performance just finished: members who didn't sing it can give it an award for a minute. */
  private openAwardWindow(item: StoredItem) {
    if (item.performedAt == null) return; // it never really started
    this.setMeta("awardWindow", { itemId: item.id, closesAt: Date.now() + AWARD_WINDOW_MS });
  }

  private giveAward(me: Member, itemId: string, award: Award) {
    if (!this.settings().awards) throw new RoomError("not_allowed", "Awards are off.");
    const win = this.getMeta<{ itemId: string; closesAt: number }>("awardWindow");
    if (!win || win.itemId !== itemId || Date.now() > win.closesAt) {
      throw new RoomError("not_allowed", "Awards for that song are closed.");
    }
    const item = this.itemRows().find((i) => i.id === itemId);
    if (!item) throw new RoomError("not_allowed", "Awards for that song are closed.");
    if (turnHolders(item).includes(me.id)) throw new RoomError("not_allowed", "Awards are for the other singers.");
    const given = this.sql.exec("SELECT 1 FROM awards WHERE item_id = ? AND member_id = ?", itemId, me.id).toArray().length > 0;
    if (given) throw new RoomError("not_allowed", "You already gave this performance an award.");
    this.sql.exec("INSERT INTO awards (item_id, member_id, award, at) VALUES (?, ?, ?, ?)", itemId, me.id, award, Date.now());
  }

  /** One reaction from `memberId` during the performance of `itemId`. */
  private countCheer(itemId: string, memberId: string) {
    this.sql.exec(
      "INSERT INTO cheers (item_id, member_id, count) VALUES (?, ?, 1) ON CONFLICT(item_id, member_id) DO UPDATE SET count = count + 1",
      itemId,
      memberId,
    );
  }

  private awardWindowState(): AwardWindow | null {
    if (!this.settings().awards || this.status() === "ended") return null;
    const win = this.getMeta<{ itemId: string; closesAt: number } | null>("awardWindow");
    if (!win || Date.now() > win.closesAt) return null;
    const item = this.itemRows().find((i) => i.id === win.itemId);
    if (!item) return null;
    const rows = this.sql.exec<{ member_id: string; award: Award }>("SELECT member_id, award FROM awards WHERE item_id = ?", item.id).toArray();
    const counts: Partial<Record<Award, number>> = {};
    for (const r of rows) counts[r.award] = (counts[r.award] ?? 0) + 1;
    return { item: publicItem(item), closesAt: win.closesAt, counts, givenBy: rows.map((r) => r.member_id) };
  }

  /** Builds the end-of-night recap (titles unless turned off), keeps it with the room and in KV for 30 days. */
  private async saveRecap(now: number) {
    const items = this.itemRows()
      .filter((i) => i.performedAt != null && (i.status === "played" || i.status === "skipped"))
      .sort((a, b) => a.performedAt! - b.performedAt!);
    const cheerRows = this.sql.exec<{ item_id: string; member_id: string; count: number }>("SELECT * FROM cheers").toArray();
    const awardRows = this.sql.exec<{ item_id: string; member_id: string; award: Award }>("SELECT item_id, member_id, award FROM awards").toArray();

    const performances: RecapPerformance[] = items.map((item) => {
      const awards: Partial<Record<Award, number>> = {};
      for (const a of awardRows) if (a.item_id === item.id) awards[a.award] = (awards[a.award] ?? 0) + 1;
      const reactions = cheerRows.filter((c) => c.item_id === item.id).reduce((n, c) => n + c.count, 0);
      const awardCount = Object.values(awards).reduce((n, c) => n + (c ?? 0), 0);
      return { item: publicItem(item), cheers: reactions + awardCount, awards };
    });

    const members = this.memberRows();
    const reactionsSent: Record<string, number> = {};
    const awardsGiven: Record<string, number> = {};
    const cheered: Record<string, string[]> = {};
    for (const c of cheerRows) {
      reactionsSent[c.member_id] = (reactionsSent[c.member_id] ?? 0) + c.count;
      (cheered[c.member_id] ??= []).push(c.item_id);
    }
    for (const a of awardRows) {
      awardsGiven[a.member_id] = (awardsGiven[a.member_id] ?? 0) + 1;
      (cheered[a.member_id] ??= []).push(a.item_id);
    }

    const titles = this.settings().titles
      ? computeTitles({
          members: members.map((m) => ({ id: m.id, joinedAt: m.joined_at })),
          performances: performances.map((p, i) => ({
            itemId: p.item.id,
            singerIds: p.item.singerIds,
            everyone: !!p.item.everyone,
            addedBy: p.item.addedBy,
            durationSec: p.item.song.durationSec,
            performedAt: items[i]!.performedAt!,
            cheers: p.cheers,
          })),
          reactionsSent,
          awardsGiven,
          cheered,
        })
      : {};
    const topMoment = performances.reduce<RecapPerformance | null>((best, p) => (p.cheers > (best?.cheers ?? 0) ? p : best), null);
    const recap: Recap = {
      id: randomKey().slice(0, 16),
      code: this.getMeta<string>("code") ?? "",
      endedAt: now,
      members: members.map((m) => ({ id: m.id, nickname: m.nickname, avatarSeed: m.avatar_seed })),
      performances,
      titles,
      topMoment,
    };
    this.setMeta("recap", recap);
    try {
      await this.env.RECAPS.put(`recap:${recap.id}`, JSON.stringify(recap), { expirationTtl: RECAP_TTL_SEC });
    } catch (e) {
      console.error("[room] couldn't save the recap", e); // the party still ends; the recap stays in the room
    }
  }

  private pendingItems(): QueueItem[] {
    return this.itemRows()
      .filter((i) => i.status === "pending")
      .sort((a, b) => a.addedAt - b.addedAt)
      .map(publicItem);
  }

  // ── State ──────────────────────────────────────────────────────────────

  /** `closing` is a socket that's going away: its member doesn't count as connected through it. */
  private state(closing?: WebSocket): RoomState {
    const connected = new Set<string>();
    let playerAttached = false;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue;
      const att = attachment(ws);
      if (att.memberId) connected.add(att.memberId);
      if (att.player) playerAttached = true;
    }
    const members: Member[] = this.memberRows().map((m) => ({
      id: m.id,
      nickname: m.nickname,
      avatarSeed: m.avatar_seed,
      role: m.role,
      connected: m.phoneless ? true : connected.has(m.id),
      joinedAt: m.joined_at,
      ...(m.phoneless ? { phoneless: true } : {}),
    }));
    const playing = this.nowPlayingItem();
    return {
      code: this.getMeta<string>("code") ?? "",
      status: this.status(),
      members,
      nowPlaying: playing ? publicItem(playing) : null,
      upNext: this.upNext().map(publicItem),
      playback: this.playback(),
      settings: this.settings(),
      pending: this.pendingItems(),
      awardWindow: this.awardWindowState(),
      recap: this.status() === "ended" ? (this.getMeta<Recap>("recap") ?? null) : null,
      playerConnected: playerAttached && this.getMeta<boolean>("playerTabOpen") === true,
      tempHostId: this.getMeta<Succession>("succession")?.actingId ?? null,
      screenPaired: this.getMeta<string>("screenKeyHash") !== null,
    };
  }

  private nowPlayingItem(): StoredItem | undefined {
    return this.itemRows().find((i) => i.status === "playing");
  }

  private upNext(): StoredItem[] {
    return orderUpNext(this.itemRows(), this.settings().queueMode);
  }

  /** Keeps pinned items moving up when the item at `index` leaves `upNext`. */
  private applyPinShift(upNext: StoredItem[], index: number) {
    for (const [id, pin] of shiftPins(upNext, index)) this.sql.exec("UPDATE items SET pin_index = ? WHERE id = ?", pin, id);
  }

  /** After items vanish from the middle of the queue, renumber pins to match the current order. */
  private normalisePins() {
    this.upNext().forEach((item, index) => {
      if (item.pinIndex !== null) this.sql.exec("UPDATE items SET pin_index = ? WHERE id = ?", index, item.id);
    });
  }

  private setItem(id: string, fields: { status?: QueueItem["status"]; startedAt?: number; pinIndex?: null }) {
    if (fields.status !== undefined) this.sql.exec("UPDATE items SET status = ? WHERE id = ?", fields.status, id);
    if (fields.startedAt !== undefined) this.sql.exec("UPDATE items SET started_at = ? WHERE id = ?", fields.startedAt, id);
    if (fields.pinIndex === null) this.sql.exec("UPDATE items SET pin_index = NULL WHERE id = ?", id);
  }

  private playback(): Playback {
    return this.getMeta<Playback>("playback") ?? idlePlayback();
  }

  private setPlayback(playback: Playback) {
    this.setMeta("playback", playback);
  }

  private settings(): RoomSettings {
    return { ...DEFAULT_SETTINGS, ...(this.getMeta<RoomSettings>("settings") ?? {}) };
  }

  private status(): "open" | "ended" {
    return this.getMeta<"open" | "ended">("status") ?? "open";
  }

  private memberRows(): MemberRow[] {
    return this.sql.exec<MemberRow>("SELECT * FROM members ORDER BY joined_at, id").toArray();
  }

  private memberRow(id: string): MemberRow | undefined {
    return this.sql.exec<MemberRow>("SELECT * FROM members WHERE id = ?", id).toArray()[0];
  }

  private itemRows(): StoredItem[] {
    return this.sql.exec<ItemRow>("SELECT * FROM items ORDER BY added_at, id").toArray().map(rowToItem);
  }

  private getMeta<T>(key: string): T | null {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return row ? (JSON.parse(row.value) as T) : null;
  }

  private setMeta(key: string, value: unknown) {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }

  private currentMember(ws: WebSocket): Member {
    const id = attachment(ws).memberId;
    const row = id ? this.memberRow(id) : undefined;
    if (!row) throw new RoomError("not_allowed", "Join the room first.");
    return { id: row.id, nickname: row.nickname, avatarSeed: row.avatar_seed, role: row.role, connected: true, joinedAt: row.joined_at };
  }

  // ── Sending ────────────────────────────────────────────────────────────

  /** The player couldn't play this song (embedding off, removed, blocked): tell its singers and the hosts why it was skipped. */
  private notifyUnplayable(item: StoredItem) {
    const told = new Set<string>([item.addedBy, ...item.singerIds]);
    for (const m of this.memberRows()) if (m.role === "host" || m.role === "cohost") told.add(m.id);
    for (const id of told) {
      for (const ws of this.socketsOf(id)) this.send(ws, { type: "error", code: "song_unplayable", message: item.song.title });
    }
  }

  private socketsOf(memberId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => attachment(ws).memberId === memberId);
  }

  private playerSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets().find((ws) => attachment(ws).player);
  }

  private isPlayer(ws: WebSocket): boolean {
    return attachment(ws).player;
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket already closing; ignore
    }
  }

  /** Sends to every joined socket except `except`. */
  private broadcast(msg: ServerMessage, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !attachment(ws).memberId) continue;
      try {
        ws.send(data);
      } catch {
        // socket already closing; ignore
      }
    }
  }

  /** Broadcasts the full state. `closing` is left out of `connected`; neither it nor `except` gets the message. */
  private broadcastState(closing?: WebSocket, except?: WebSocket) {
    const data = JSON.stringify({ type: "state", state: this.state(closing) } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing || ws === except || !attachment(ws).memberId) continue;
      try {
        ws.send(data);
      } catch {
        // socket already closing; ignore
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function attachment(ws: WebSocket): Attachment {
  return (ws.deserializeAttachment() as Attachment | null) ?? { memberId: null, wantsPlayer: false, player: false };
}

/** Where playback is now, extrapolated from the last report while playing. */
function position(pb: Playback, now: number): number {
  return pb.state === "playing" ? pb.positionSec + (now - pb.updatedAt) / 1000 : pb.positionSec;
}

export function idlePlayback(now = Date.now()): Playback {
  return { state: "idle", positionSec: 0, updatedAt: now, countdownEndsAt: null };
}

function rowToItem(row: ItemRow): StoredItem {
  return {
    id: row.id,
    song: JSON.parse(row.song) as Song,
    singerIds: JSON.parse(row.singer_ids) as string[],
    addedBy: row.added_by,
    status: row.status,
    addedAt: row.added_at,
    startedAt: row.started_at,
    pinIndex: row.pin_index,
    performedAt: row.performed_at ?? null,
    ...(row.everyone ? { everyone: true } : {}),
  };
}

function publicItem(item: StoredItem): QueueItem {
  const { startedAt: _s, pinIndex: _p, performedAt: _f, ...rest } = item;
  return rest;
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeSettings(input: Partial<RoomSettings>): Partial<RoomSettings> {
  const out: Partial<RoomSettings> = {};
  if (input.queueMode === "rotation" || input.queueMode === "fifo" || input.queueMode === "approval") {
    out.queueMode = input.queueMode;
  }
  if (typeof input.maxWaitingPerMember === "number" && Number.isFinite(input.maxWaitingPerMember)) {
    out.maxWaitingPerMember = Math.max(1, Math.min(20, Math.trunc(input.maxWaitingPerMember)));
  }
  if (typeof input.countdownSec === "number" && Number.isFinite(input.countdownSec)) {
    out.countdownSec = Math.max(0, Math.min(30, Math.trunc(input.countdownSec)));
  }
  if (input.joinInfo === "between" || input.joinInfo === "always" || input.joinInfo === "start") out.joinInfo = input.joinInfo;
  if (input.tvLayout === "bar" || input.tvLayout === "clean") out.tvLayout = input.tvLayout;
  if (input.tvBarSize === "small" || input.tvBarSize === "medium" || input.tvBarSize === "large") out.tvBarSize = input.tvBarSize;
  for (const key of ["hostsOnlyAdd", "locked", "reactions", "getReadyCard", "duets", "turnAlerts", "awards", "titles", "tvHideBar"] as const) {
    if (typeof input[key] === "boolean") out[key] = input[key];
  }
  return out;
}

const isStr = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function isSong(v: unknown): v is Song {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    isStr(s.videoId, 64) &&
    typeof s.title === "string" &&
    typeof s.channel === "string" &&
    typeof s.durationSec === "number" &&
    typeof s.thumbnailUrl === "string"
  );
}

/** Parses and checks a client message's shape. Throws with a short reason. */
export function parseClientMessage(text: string): ClientMessage {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!m || typeof m !== "object" || typeof m.type !== "string") throw new Error("Missing type");
  const ok = (cond: boolean) => {
    if (!cond) throw new Error(`Bad ${m.type} message`);
  };
  switch (m.type) {
    case "join":
      ok(isStr(m.nickname, 100) && typeof m.avatarSeed === "string");
      break;
    case "rejoin":
      ok(isStr(m.memberId, 64) && isStr(m.key, 128));
      break;
    case "add_song":
      ok(
        isSong(m.song) &&
          (m.singerIds === undefined ||
            (Array.isArray(m.singerIds) && m.singerIds.length <= 8 && m.singerIds.every((id) => isStr(id, 64)))) &&
          (m.everyone === undefined || typeof m.everyone === "boolean"),
      );
      break;
    case "approve_song":
    case "decline_song":
      ok(isStr(m.itemId, 64));
      break;
    case "give_award":
      ok(isStr(m.itemId, 64) && (AWARDS as readonly unknown[]).includes(m.award));
      break;
    case "remove_song":
      ok(isStr(m.itemId, 64));
      break;
    case "move_song":
      ok(isStr(m.itemId, 64) && typeof m.toIndex === "number" && Number.isFinite(m.toIndex));
      break;
    case "skip":
    case "pause":
    case "resume":
    case "restart":
    case "end_party":
    case "show_join":
      break;
    case "player_status":
      ok(typeof m.tabOpen === "boolean");
      break;
    case "set_role":
      ok(isStr(m.memberId, 64) && (m.role === "cohost" || m.role === "guest"));
      break;
    case "kick":
    case "remove_member_songs":
      ok(isStr(m.memberId, 64));
      break;
    case "leave":
    case "remove_screen":
      break;
    case "add_guest":
      ok(isStr(m.nickname, 100) && typeof m.avatarSeed === "string");
      break;
    case "update_settings":
      ok(!!m.settings && typeof m.settings === "object");
      break;
    case "react":
      ok((REACTIONS as readonly unknown[]).includes(m.reaction));
      break;
    case "player_event":
      ok(
        ["started", "progress", "ended", "error"].includes(m.event as string) &&
          isStr(m.itemId, 64) &&
          (m.positionSec === undefined || typeof m.positionSec === "number") &&
          (m.durationSec === undefined || typeof m.durationSec === "number"),
      );
      break;
    default:
      throw new Error(`Unknown message type: ${m.type}`);
  }
  return m as ClientMessage;
}
