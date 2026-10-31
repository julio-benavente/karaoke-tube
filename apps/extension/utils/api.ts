import type { HealthResponse } from "@karaoke-tube/shared";

export const API_URL: string = import.meta.env.WXT_API_URL ?? "http://localhost:8787";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  return res.json();
}

// Messages between content script / popup and the background service worker.
export type ExtMessage = { type: "PING_API" } | { type: "VIDEO_CHANGED"; videoId: string | null };
