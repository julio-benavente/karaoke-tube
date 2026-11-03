import { useEffect, useState } from "react";
import type { ExtMessage } from "@/utils/api";

type ApiStatus = "checking" | "ok" | "error";

const currentVideoId = () => new URL(location.href).searchParams.get("v");

export function Badge() {
  const [api, setApi] = useState<ApiStatus>("checking");
  const [videoId, setVideoId] = useState<string | null>(currentVideoId());

  // Ping the API through the background service worker.
  useEffect(() => {
    browser.runtime
      .sendMessage({ type: "PING_API" } satisfies ExtMessage)
      .then((res: { ok: boolean }) => {
        console.log("[content] API via background:", res);
        setApi(res?.ok ? "ok" : "error");
      })
      .catch((e) => {
        console.error("[content] API ping failed:", e);
        setApi("error");
      });
  }, []);

  // YouTube is a single-page app: `yt-navigate-finish` fires on every in-app navigation.
  useEffect(() => {
    const onNavigate = () => setVideoId(currentVideoId());
    document.addEventListener("yt-navigate-finish", onNavigate);
    return () => document.removeEventListener("yt-navigate-finish", onNavigate);
  }, []);

  // Runs once per actual video change (no duplicate logs).
  useEffect(() => {
    console.log("[content] current video:", videoId);
    browser.runtime.sendMessage({ type: "VIDEO_CHANGED", videoId } satisfies ExtMessage);

    const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
    if (video) video.onended = () => console.log("[content] video ended:", videoId);
  }, [videoId]);

  const apiLabel = { checking: "API …", ok: "API ✓", error: "API ✗" }[api];
  const apiColor = { checking: "#facc15", ok: "#4ade80", error: "#f87171" }[api];

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 14px",
        borderRadius: 999,
        background: "rgba(17, 17, 17, 0.88)",
        color: "#fff",
        font: "500 13px/1.2 system-ui, -apple-system, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      <span>🎤 Karaoke Tube</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ color: apiColor }}>{apiLabel}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span style={{ fontFamily: "ui-monospace, monospace" }}>{videoId ?? "no video"}</span>
    </div>
  );
}
