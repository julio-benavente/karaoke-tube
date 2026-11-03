import { useEffect, useState } from "react";
import type { OverlayInfo } from "@/utils/ports";

/**
 * Placeholder TV overlay: room code, who's singing and who's next. Mounted inside `#movie_player`
 * so it stays visible in fullscreen. Spec B delivers the real overlay components.
 */
export function Badge({ overlay }: { overlay: OverlayInfo }) {
  const countdown = useCountdown(overlay.getReadyEndsAt);
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 64,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: "60%",
        padding: "10px 16px",
        borderRadius: 14,
        background: "rgba(17, 17, 17, 0.82)",
        color: "#fff",
        font: "500 15px/1.3 system-ui, -apple-system, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      <span style={{ opacity: 0.7, fontSize: 13 }}>
        🎤 Karaoke Tube · join with code <b style={{ fontFamily: "ui-monospace, monospace", opacity: 1 }}>{overlay.code}</b>
      </span>
      {countdown !== null && <span style={{ fontSize: 20, fontWeight: 700 }}>Get ready… {countdown}</span>}
      <span>
        <span style={{ opacity: 0.6 }}>Now singing: </span>
        {overlay.nowSinging ?? "nobody yet, add a song!"}
      </span>
      {overlay.upNext && (
        <span>
          <span style={{ opacity: 0.6 }}>Up next: </span>
          {overlay.upNext}
        </span>
      )}
    </div>
  );
}

function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (endsAt === null) return null;
  const left = Math.ceil((endsAt - now) / 1000);
  return left > 0 ? left : null;
}
