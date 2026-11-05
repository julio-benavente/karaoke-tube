import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { PairStartResponse, PairStatusResponse } from "@karaoke-tube/shared";
import { Logo, useT } from "@karaoke-tube/ui";
import { loadScreen, saveScreen } from "./screenStore";
import { useWakeLock } from "./useWakeLock";
import { isPhoneDevice } from "../host/phone";
import { resumableHostRoom } from "../session";
import { SamePhoneWarning } from "./SamePhoneWarning";

const page = { position: "fixed", inset: 0, background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3dvh", textAlign: "center", padding: 24, fontFamily: '"Figtree", system-ui, sans-serif' } as const;
const button = { font: "inherit", fontWeight: 800, fontSize: "2.6dvh", padding: "1.4dvh 3.6dvh", minHeight: 44, borderRadius: 999, border: "0.3dvh solid #ff4f8b", background: "transparent", color: "#fff", cursor: "pointer" } as const;

/** The TV swaps its code for a fresh one this many seconds before the old one would expire. */
const REFRESH_BEFORE_SEC = 45;

type Pair = PairStartResponse & { expiresAt: number };

/**
 * /tv: a TV that is not paired yet shows a short code. The host types it into the host app (Settings → TV
 * screen) and the TV carries on to the party's screen. A paired TV goes straight to its party.
 * The code renews itself every few minutes while it waits, and "New code" (OK on a remote) gets one right away.
 */
export function TvPair() {
  const hosting = resumableHostRoom();
  if (isPhoneDevice() && hosting) return <SamePhoneWarning code={hosting} />;
  const paired = loadScreen();
  if (paired) return <Navigate to={`/tv/${paired.code}`} replace />;
  return <Waiting />;
}

function Waiting() {
  const t = useT();
  useWakeLock(true); // a phone waiting for its code shouldn't fall asleep
  const navigate = useNavigate();
  const [pair, setPair] = useState<Pair | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const current = useRef<Pair | null>(null);
  current.current = pair;
  // For testing: `/tv?rotate=8` renews the code every 8 seconds.
  const rotateSec = Number(new URLSearchParams(location.search).get("rotate")) || null;

  /** Ask for a code; the one being replaced (if any) stops working. The old one stays on screen until the new one arrives. */
  const begin = useCallback(async () => {
    setFailed(false);
    try {
      const r = await fetch("/api/pair/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previous: current.current?.id }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const p = (await r.json()) as PairStartResponse;
      setPair({ ...p, expiresAt: Date.now() + (rotateSec ? rotateSec * 1000 + REFRESH_BEFORE_SEC * 1000 : p.expiresInSec * 1000) });
    } catch {
      if (!current.current) setFailed(true);
    }
  }, [rotateSec]);

  useEffect(() => {
    void begin();
  }, [begin]);

  // Clock for the countdown, and the renewal itself.
  const renewing = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      const p = current.current;
      if (p && !renewing.current && p.expiresAt - Date.now() <= REFRESH_BEFORE_SEC * 1000) {
        renewing.current = true;
        void begin().finally(() => (renewing.current = false));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [begin]);

  // Wait for the host to enter the code on screen.
  const id = pair?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pair/${id}`);
        const s = (await r.json()) as PairStatusResponse;
        if (!alive) return;
        if (s.state === "paired") {
          saveScreen({ code: s.roomCode, key: s.screenKey });
          navigate(`/tv/${s.roomCode}`, { replace: true });
        } else if (s.state === "expired" && current.current?.id === id) {
          void begin(); // e.g. the TV was asleep past its code
        }
      } catch {
        // offline for a moment: keep trying
      }
    };
    const timer = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, navigate, begin]);

  const left = pair ? Math.max(0, Math.round((pair.expiresAt - now) / 1000) - REFRESH_BEFORE_SEC) : 0;
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div style={page} data-testid="tv-pair">
      <Logo size={56} />
      <h1 style={{ margin: 0, fontSize: "5dvh" }}>{t("tvpair.title")}</h1>
      {failed ? (
        <>
          <p style={{ fontSize: "3dvh", opacity: 0.8 }}>{t("tvpair.failed")}</p>
          <button autoFocus style={button} onClick={() => void begin()}>
            {t("common.tryAgain")}
          </button>
        </>
      ) : (
        <>
          <div data-testid="tv-pair-code" style={{ fontSize: "min(16dvh, 15vw)", fontWeight: 900, letterSpacing: "0.12em", color: "#ff4f8b", lineHeight: 1 }}>
            {pair ? pair.code : "…"}
          </div>
          <p style={{ fontSize: "3dvh", opacity: 0.85, maxWidth: "70vw", margin: 0 }}>{t("tvpair.hint")}</p>
          <p data-testid="tv-pair-timer" style={{ fontSize: "2.2dvh", opacity: 0.55, margin: 0 }}>
            {t("tvpair.renews", { time: mmss })}
          </p>
          <button autoFocus style={button} onClick={() => void begin()} data-testid="tv-pair-new">
            {t("tvpair.newCode")}
          </button>
        </>
      )}
    </div>
  );
}
