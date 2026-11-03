// Types and constants shared by the API, the guest web app and the extension.

export const APP_NAME = "Karaoke Tube";

export type HealthResponse = {
  ok: true;
  service: string;
  time: string;
};

// The contract between the tracks (domain types, WebSocket messages, HTTP responses, client interfaces).
export * from "./protocol";
