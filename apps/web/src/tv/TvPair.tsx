import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import type { PairStartResponse, PairStatusResponse } from "@karaoke-tube/shared";
import { Logo, useT } from "@karaoke-tube/ui";
import { loadScreen, saveScreen } from "./screenStore";

const page = { position: "fixed", inset: 0, background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3vh", textAlign: "center", padding: 24, fontFamily: '"Figtree", system-ui, sans-serif' } as const;

/**
 * /tv: a TV that is not paired yet shows a short code. The host types it into the host app (Settings → TV
 * screen) and the TV carries on to the party's screen. A paired TV goes straight to its party.
 */
export function TvPair() {
  const paired = loadScreen();
  if (paired) return <Navigate to={`/tv/${paired.code}`} replace />;
  return <Waiting />;
}

function Waiting() {
  const t = useT();
  const navigate = useNavigate();
  const [pair, setPair] = useState<PairStartResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);

  // Ask for a code (again when it expires).
  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch("/api/pair/start", { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<PairStartResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((p) => alive && setPair(p))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [round]);

  // Wait for the host to enter it.
  useEffect(() => {
    if (!pair) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/pair/${pair.id}`);
        const s = (await r.json()) as PairStatusResponse;
        if (!alive) return;
        if (s.state === "paired") {
          saveScreen({ code: s.roomCode, key: s.screenKey });
          navigate(`/tv/${s.roomCode}`, { replace: true });
        } else if (s.state === "expired") {
          setPair(null);
          setRound((n) => n + 1);
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
  }, [pair, navigate]);

  return (
    <div style={page} data-testid="tv-pair">
      <Logo size={56} />
      <h1 style={{ margin: 0, fontSize: "5vh" }}>{t("tvpair.title")}</h1>
      {failed ? (
        <>
          <p style={{ fontSize: "3vh", opacity: 0.8 }}>{t("tvpair.failed")}</p>
          <button style={{ font: "inherit", fontWeight: 800, fontSize: "3vh", padding: "1.5vh 4vh", borderRadius: 999, border: 0, background: "#ff4f8b", color: "#1f0711", cursor: "pointer" }} onClick={() => setRound((n) => n + 1)}>
            {t("common.tryAgain")}
          </button>
        </>
      ) : (
        <>
          <div data-testid="tv-pair-code" style={{ fontSize: "16vh", fontWeight: 900, letterSpacing: "0.12em", color: "#ff4f8b", lineHeight: 1 }}>
            {pair ? `${pair.code.slice(0, 3)} ${pair.code.slice(3)}` : "…"}
          </div>
          <p style={{ fontSize: "3vh", opacity: 0.85, maxWidth: "70vw", margin: 0 }}>{t("tvpair.hint")}</p>
        </>
      )}
    </div>
  );
}
