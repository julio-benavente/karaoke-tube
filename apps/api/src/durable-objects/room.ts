import { DurableObject } from "cloudflare:workers";
import type { RoomMessage } from "@karaoke-tube/shared";

/**
 * One instance per room. Uses the WebSocket Hibernation API, so idle rooms
 * cost (almost) nothing while sockets stay connected.
 */
export class Room extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    const members = this.ctx.getWebSockets().length;
    console.log(`[room] socket connected, members=${members}`);
    this.broadcast({ type: "system", text: "someone joined", members });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    console.log(`[room] message: ${text}`);

    let msg: RoomMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      ws.send(JSON.stringify({ type: "system", text: "invalid JSON", members: 0 }));
      return;
    }
    // For now: echo every message to everyone in the room.
    this.broadcast(msg);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    // 1005/1006 are "reserved" codes a client can report but we can't send back.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
    const members = this.ctx.getWebSockets().filter((s) => s !== ws).length;
    console.log(`[room] socket closed (code ${code}), members=${members}`);
    this.broadcast({ type: "system", text: "someone left", members }, ws);
  }

  private broadcast(msg: RoomMessage, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        // socket already closing; ignore
      }
    }
  }
}
