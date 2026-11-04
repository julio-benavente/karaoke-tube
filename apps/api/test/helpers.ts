import { SELF } from "cloudflare:test";
import type { ClientMessage, CreateRoomResponse, RoomState, ServerMessage, Song } from "@karaoke-tube/shared";

export const BASE = "http://karaoke.test";

export async function createRoom(nickname = "Host"): Promise<CreateRoomResponse> {
  const res = await SELF.fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname, avatarSeed: "seed" }),
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return res.json();
}

/** A test WebSocket client that records every message from the room. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  closed = false;
  /** Heartbeat replies ("pong"), which aren't JSON. */
  pongs = 0;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      if (e.data === "pong") {
        this.pongs++;
        for (const w of this.waiters.splice(0)) w();
        return;
      }
      this.messages.push(JSON.parse(e.data as string));
      for (const w of this.waiters.splice(0)) w();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const w of this.waiters.splice(0)) w();
    });
  }

  static async open(code: string, query = ""): Promise<TestClient> {
    const res = await SELF.fetch(`${BASE}/api/rooms/${code}/ws${query}`, { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket;
    if (!ws) throw new Error(`no websocket: ${res.status}`);
    ws.accept();
    return new TestClient(ws);
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  /** Messages already returned by `next`, so each one is handed out once. */
  private consumed = new Set<number>();

  /** Waits for the oldest not-yet-returned message of `type` (at or after index `from`). */
  async next<T extends ServerMessage["type"]>(type: T, from = 0): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const index = this.messages.findIndex((m, i) => i >= from && m.type === type && !this.consumed.has(i));
      if (index !== -1) {
        this.consumed.add(index);
        return this.messages[index] as Extract<ServerMessage, { type: T }>;
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}; got ${JSON.stringify(this.messages.slice(from).map((m) => m.type))}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  /** Waits for a state broadcast that matches `pred`. */
  async waitForState(pred: (s: RoomState) => boolean): Promise<RoomState> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const found = this.messages.find((m) => m.type === "state" && pred(m.state));
      if (found && found.type === "state") return found.state;
      if (Date.now() > deadline) throw new Error("timed out waiting for a matching state");
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  /** Sends `msg` and waits for the reply of `type`. */
  async request<T extends ServerMessage["type"]>(msg: ClientMessage, type: T) {
    const from = this.messages.length;
    this.send(msg);
    return this.next(type, from);
  }

  /**
   * Sends `msg`, then a marker the room rejects. The room handles one socket's messages in order, so
   * once the marker's error is back, every message caused by `msg` has arrived.
   */
  private async roundTrip(msg: ClientMessage): Promise<ServerMessage[]> {
    const from = this.messages.length;
    const marker = `marker-${++this.markers}`;
    this.send(msg);
    this.ws.send(JSON.stringify({ type: marker }));
    const deadline = Date.now() + 2000;
    for (;;) {
      const got = this.messages.slice(from);
      const end = got.findIndex((m) => m.type === "error" && m.message.includes(marker));
      if (end !== -1) {
        return got.slice(0, end);
      }
      if (Date.now() > deadline) throw new Error(`timed out on ${msg.type}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }
  private markers = 0;

  /** Sends and returns the latest state once the room has handled it. Fails if the room replied with an error. */
  async act(msg: ClientMessage) {
    const got = await this.roundTrip(msg);
    // `song_unplayable` is a notice about a song, not a failure of this request.
    const error = got.find((m) => m.type === "error" && m.code !== "song_unplayable");
    if (error) throw new Error(`${msg.type} failed: ${JSON.stringify(error)}`);
    const states = got.filter((m) => m.type === "state");
    const last = states.at(-1);
    if (!last) throw new Error(`${msg.type}: no state broadcast`);
    return last.state;
  }

  /** Sends and expects an error back. */
  async expectError(msg: ClientMessage) {
    const error = (await this.roundTrip(msg)).find((m) => m.type === "error");
    if (!error) throw new Error(`${msg.type}: expected an error`);
    return error.code;
  }

  async join(nickname: string) {
    return this.request({ type: "join", nickname, avatarSeed: nickname }, "welcome");
  }

  close() {
    this.ws.close(1000, "done");
  }
}

let n = 0;
export function song(title = `Song ${++n}`): Song {
  return { videoId: `vid${n}`.padEnd(11, "x"), title, channel: "Karaoke Channel", durationSec: 180, thumbnailUrl: "https://i.ytimg.com/x.jpg" };
}

/** Creates a room and connects the host (as the player unless `player` is false). */
export async function hostRoom(opts: { player?: boolean } = {}) {
  const created = await createRoom();
  const host = await TestClient.open(created.code, opts.player === false ? "" : "?player=1");
  const welcome = await host.request({ type: "rejoin", memberId: created.memberId, key: created.key }, "welcome");
  return { ...created, host, welcome };
}

export async function guest(code: string, nickname: string) {
  const client = await TestClient.open(code);
  const welcome = await client.join(nickname);
  return { client, id: welcome.memberId, key: welcome.key, welcome };
}
