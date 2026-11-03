import { normalizeRoomCode, type ClientMessage, type RoomClient, type ServerMessage } from "@karaoke-tube/shared";
import { BaseRoomClient } from "./base";

export type Credentials = { memberId: string; key: string };

/** Where a client keeps its member id + key so it can rejoin after a refresh. */
export interface CredentialStore {
  load(code: string): Credentials | null;
  save(code: string, creds: Credentials): void;
  clear(code: string): void;
}

export type CreateRoomClientOptions = {
  code: string;
  /** API origin, e.g. `http://localhost:8787`. Empty or omitted = the page's own origin. */
  baseUrl?: string;
  /** Joins with this when there's nothing to rejoin with. Without it, send `{ type: "join" }` yourself. */
  identity?: { nickname: string; avatarSeed: string };
  /** Defaults to `localStorage` under `kt:room:<CODE>`. */
  credentials?: CredentialStore;
  /** Connect as the party's YouTube player (the extension, authenticated as the host). */
  player?: boolean;
  /** Every message from the room, raw. The extension's player uses it for `play` / `player_command`. */
  onServerMessage?: (msg: ServerMessage) => void;
  /** For tests: the WebSocket constructor. */
  WebSocket?: typeof WebSocket;
};

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];

export const storageKey = (code: string) => `kt:room:${normalizeRoomCode(code)}`;

export function localStorageCredentials(): CredentialStore {
  return {
    load(code) {
      try {
        const raw = localStorage.getItem(storageKey(code));
        const parsed = raw ? (JSON.parse(raw) as Partial<Credentials>) : null;
        return parsed?.memberId && parsed.key ? { memberId: parsed.memberId, key: parsed.key } : null;
      } catch {
        return null;
      }
    },
    save(code, creds) {
      try {
        localStorage.setItem(storageKey(code), JSON.stringify(creds));
      } catch {
        // private mode / storage blocked: the session still works, it just can't rejoin after a refresh
      }
    },
    clear(code) {
      try {
        localStorage.removeItem(storageKey(code));
      } catch {
        // ignore
      }
    },
  };
}

/** Credentials kept in memory, optionally seeded (the extension loads them from chrome.storage). */
export function memoryCredentials(initial?: Credentials | null, onSave?: (creds: Credentials | null) => void): CredentialStore {
  let creds = initial ?? null;
  return {
    load: () => creds,
    save: (_code, c) => {
      creds = c;
      onSave?.(c);
    },
    clear: () => {
      creds = null;
      onSave?.(null);
    },
  };
}

function wsUrl(baseUrl: string | undefined, code: string, player: boolean): string {
  const base = baseUrl || (typeof location !== "undefined" ? location.origin : "");
  const url = new URL(`/api/rooms/${encodeURIComponent(normalizeRoomCode(code))}/ws`, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (player) url.searchParams.set("player", "1");
  return url.toString();
}

class WebSocketRoomClient extends BaseRoomClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private outbox: ClientMessage[] = [];
  private joined = false;
  private closedByUser = false;
  private readonly code: string;
  private readonly url: string;
  private readonly store: CredentialStore;
  private readonly WS: typeof WebSocket;

  constructor(private readonly opts: CreateRoomClientOptions) {
    super();
    this.code = normalizeRoomCode(opts.code);
    this.url = wsUrl(opts.baseUrl, this.code, !!opts.player);
    this.store = opts.credentials ?? localStorageCredentials();
    this.WS = opts.WebSocket ?? WebSocket;
    this.memberId = this.store.load(this.code)?.memberId ?? null;
    this.connect();
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
  }

  send(msg: ClientMessage) {
    if (this.closedByUser) return;
    const ready = this.ws?.readyState === this.WS.OPEN;
    // join/rejoin go straight out; everything else waits until we're a member.
    if (ready && (this.joined || msg.type === "join" || msg.type === "rejoin")) {
      this.ws!.send(JSON.stringify(msg));
    } else if (this.outbox.length < 50) {
      this.outbox.push(msg);
    }
  }

  close() {
    this.closeReason ??= "left";
    this.closedByUser = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    this.ws?.close(1000, "bye");
    this.ws = null;
    this.setStatus("closed");
  }

  private onOnline = () => {
    if (this.status !== "reconnecting" || this.closedByUser) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connect();
  };

  private connect() {
    this.retryTimer = null;
    this.joined = false;
    const ws = new this.WS(this.url);
    this.ws = ws;
    ws.onopen = () => {
      const creds = this.store.load(this.code);
      if (creds) ws.send(JSON.stringify({ type: "rejoin", ...creds } satisfies ClientMessage));
      else if (this.opts.identity) ws.send(JSON.stringify({ type: "join", ...this.opts.identity } satisfies ClientMessage));
      else this.flush(true); // a join the UI queued up
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    // Browsers fire `error` then `close`; some runtimes fire only `error` for a refused connection.
    ws.onclose = () => this.onDown(ws);
    ws.onerror = () => this.onDown(ws);
  }

  /** The socket is gone: schedule a reconnect (once per socket). */
  private onDown(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    this.joined = false;
    try {
      ws.close();
    } catch {
      // already closed
    }
    if (this.closedByUser || this.status === "closed") return;
    this.setStatus("reconnecting");
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private onMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.store.save(this.code, { memberId: msg.memberId, key: msg.key });
        this.joined = true;
        this.attempt = 0;
        this.status = "open";
        this.setState(msg.state, msg.memberId);
        this.flush(false);
        if (msg.state.status === "ended") this.closeAs("ended");
        break;
      case "state":
        this.setState(msg.state);
        break;
      case "reaction":
        this.emitReaction({ memberId: msg.memberId, reaction: msg.reaction });
        break;
      case "error":
        if (msg.code === "bad_key") {
          // Our saved membership is gone (kicked, or the room was recreated): start fresh.
          this.store.clear(this.code);
          this.memberId = null;
          if (this.opts.identity) {
            this.ws?.send(JSON.stringify({ type: "join", ...this.opts.identity } satisfies ClientMessage));
            return;
          }
        }
        if (msg.code === "room_not_found" || ((msg.code === "room_locked" || msg.code === "room_ended") && !this.joined)) {
          // Nothing to retry: stop here.
          this.setStatus("closed");
          this.ws?.close(1000, msg.code);
        } else if (!this.joined && this.status === "connecting") {
          // Socket is up and waiting for the UI to join.
          this.setStatus("open");
        }
        this.emitError({ code: msg.code, message: msg.message });
        break;
      case "kicked":
        this.store.clear(this.code);
        this.closeAs("kicked");
        break;
      case "ended":
        this.closeAs("ended");
        break;
      // `play` / `player_command` are for the extension's player; `ended` is also in the state.
      default:
        break;
    }
    this.opts.onServerMessage?.(msg);
  }

  /** The server ended our membership: stop for good, no reconnect. */
  private closeAs(reason: "kicked" | "ended") {
    this.closeReason = reason;
    this.setStatus("closed");
    this.ws?.close(1000, reason);
  }

  /** Sends queued messages: only a queued join/rejoin before we're a member, everything after. */
  private flush(joinOnly: boolean) {
    const pending = this.outbox;
    this.outbox = [];
    for (const msg of pending) {
      if (joinOnly && msg.type !== "join" && msg.type !== "rejoin") {
        this.outbox.push(msg);
        continue;
      }
      this.ws?.send(JSON.stringify(msg));
    }
    if (joinOnly && this.status === "connecting") this.setStatus("open");
  }
}

/**
 * The real `RoomClient` over WebSocket. Saves `memberId` + `key` (localStorage `kt:room:<CODE>` by default) and
 * rejoins automatically; reconnects with backoff (1 s, 2 s, 4 s, … max 10 s), status `reconnecting` meanwhile.
 */
export function createRoomClient(opts: CreateRoomClientOptions): RoomClient {
  return new WebSocketRoomClient(opts);
}
