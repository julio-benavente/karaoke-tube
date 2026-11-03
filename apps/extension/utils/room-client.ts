import { BaseRoomClient } from "@karaoke-tube/client";
import type { ClientMessage, RoomClient } from "@karaoke-tube/shared";
import { ROOM_PORT, type RoomPortToBackground, type RoomPortToPage } from "./ports";

/**
 * `RoomClient` for extension pages (the host app). The background holds the real WebSocket;
 * this talks to it over a `chrome.runtime` port named `room` and reconnects if the service worker restarts.
 */
class ExtensionRoomClient extends BaseRoomClient {
  private port: Browser.runtime.Port | null = null;
  private closed = false;
  private outbox: ClientMessage[] = [];

  constructor() {
    super();
    this.connect();
  }

  send(msg: ClientMessage) {
    if (this.closed) return;
    if (this.port && this.status === "open") this.post({ type: "send", msg });
    else if (this.outbox.length < 50) this.outbox.push(msg);
  }

  close() {
    this.closeReason ??= "left";
    this.closed = true;
    this.port?.disconnect();
    this.port = null;
    this.setStatus("closed");
  }

  private post(msg: RoomPortToBackground) {
    this.port?.postMessage(msg);
  }

  private connect() {
    const port = browser.runtime.connect({ name: ROOM_PORT });
    this.port = port;
    port.onMessage.addListener((raw) => {
      const msg = raw as RoomPortToPage;
      if (msg.type === "snapshot") {
        this.status = msg.status;
        this.closeReason = msg.closeReason;
        this.setState(msg.state, msg.memberId);
        if (msg.status === "open" && this.outbox.length) {
          const pending = this.outbox;
          this.outbox = [];
          for (const m of pending) this.post({ type: "send", msg: m });
        }
      } else if (msg.type === "reaction") {
        this.emitReaction({ memberId: msg.memberId, reaction: msg.reaction });
      } else if (msg.type === "error") {
        this.emitError({ code: msg.code, message: msg.message });
      }
    });
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      if (this.closed) return;
      // The service worker went away (idle or update). Waking it with a new connection restores the party.
      this.setStatus("reconnecting");
      setTimeout(() => !this.closed && this.connect(), 500);
    });
  }
}

export function createExtensionRoomClient(): RoomClient {
  return new ExtensionRoomClient();
}
