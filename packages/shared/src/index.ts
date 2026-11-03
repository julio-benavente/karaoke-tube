// Types and constants shared by the API, the guest web app and the extension.

export const APP_NAME = "Karaoke Tube";

export type HealthResponse = {
  ok: true;
  service: string;
  time: string;
};

// Messages sent over a room's WebSocket.
export type RoomMessage =
  | { type: "hello"; from: string }
  | { type: "chat"; from: string; text: string }
  | { type: "system"; text: string; members: number };
export * from "./protocol";
