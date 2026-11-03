import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize } from "lucide-react";
import { createRoomClient } from "@karaoke-tube/client";
import type { QueueItem, RoomClient, ServerMessage } from "@karaoke-tube/shared";
import { normalizeRoomCode } from "@karaoke-tube/shared";
import { useParams } from "react-router";
import { adoptHostLink, hasCredentials } from "../host/client";
import { TvPlayer } from "./player";
import { TvLayer } from "./TvLayer";

const AWARDS_SHOW_MS = 60_000;

const page = { position: "fixed", inset: 0, background: "#000", color: "#fff", overflow: "hidden", fontFamily: '"Figtree", system-ui, sans-serif' } as const;
const center = { ...page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 } as const;
const bigBtn = { font: "inherit", fontWeight: 800, fontSize: 24, padding: "16px 32px", borderRadius: 999, border: 0, background: "#ff4f8b", color: "#1f0711", cursor: "pointer" } as const;

function fullscreen() {
  const d = document;
  if (d.fullscreenElement) void d.exitFullscreen().catch(() => {});
  else void d.documentElement.requestFullscreen?.().catch(() => {});
}

/** /tv/:code: the party's TV screen. Plays the queue with the YouTube IFrame API; the host app remote-controls it. */
export function TvScreen() {
  const code = normalizeRoomCode(useParams().code ?? "");
  // Before creating the client: it rejoins with the credentials the host app's link carries (#m=..&k=..).
  const allowed = useMemo(() => {
    adoptHostLink(code);
    return hasCredentials(code);
  }, [code]);
  if (!allowed) {
    return (
      <div style={center}>
        <h1>This screen isn't linked to a party</h1>
        <p>Open it from the host app with "Open TV screen".</p>
        <a style={{ color: "#ff4f8b" }} href={`/host/${code}`}>
          Go to the host app
        </a>
      </div>
    );
  }
  return <Tv code={code} />;
}

function Tv({ code }: { code: string }) {
  const [started, setStarted] = useState(false);
  const clientRef = useRef<RoomClient | null>(null);
  const playerRef = useRef<TvPlayer | null>(null);
  const wantPlay = useRef<QueueItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<RoomClient | null>(null);

  const startAtFor = (item: QueueItem): number => {
    const state = clientRef.current?.state;
    if (!state || state.nowPlaying?.id !== item.id) return 0;
    const pb = state.playback;
    if (pb.state === "playing") return pb.positionSec + Math.max(0, Date.now() - pb.updatedAt) / 1000;
    if (pb.state === "paused") return pb.positionSec;
    return 0;
  };

  // Room connection (as the party's player). Created in an effect so StrictMode's double mount is clean.
  useEffect(() => {
    const onServerMessage = (msg: ServerMessage) => {
      if (msg.type === "play") {
        wantPlay.current = msg.item;
        playerRef.current?.play(msg.item, startAtFor(msg.item));
      } else if (msg.type === "player_command") {
        playerRef.current?.command(msg.command);
      }
    };
    const c = createRoomClient({ code, player: true, onServerMessage });
    clientRef.current = c;
    setClient(c);
    return () => {
      c.close();
      clientRef.current = null;
      setClient(null);
    };
  }, [code]);

  const subscribe = useCallback((l: () => void) => client?.subscribe(l) ?? (() => {}), [client]);
  const state = useSyncExternalStore(subscribe, () => client?.state ?? null);
  const status = useSyncExternalStore(subscribe, () => client?.status ?? "connecting");
  const closeReason = useSyncExternalStore(subscribe, () => client?.closeReason ?? null);

  // Create the YouTube player after the Start click.
  const [playerReady, setPlayerReady] = useState(false);
  useEffect(() => {
    if (!started || !wrapRef.current || !targetRef.current) return;
    const report = (event: "started" | "progress" | "ended" | "error", itemId: string, positionSec?: number, durationSec?: number) =>
      clientRef.current?.send({ type: "player_event", event, itemId, positionSec, durationSec });
    const p = new TvPlayer(targetRef.current, wrapRef.current, report, () => setPlayerReady(true));
    playerRef.current = p;
    if (wantPlay.current) p.play(wantPlay.current, startAtFor(wantPlay.current));
    return () => {
      p.dispose();
      playerRef.current = null;
      setPlayerReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Tell the room the TV is there once the player is ready (and again after every reconnection).
  useEffect(() => {
    if (status === "open") client?.send({ type: "player_status", tabOpen: playerReady });
  }, [status, playerReady, client]);

  // Queue empty → stop the video and show the idle overlay.
  const hasNowPlaying = !!state?.nowPlaying;
  useEffect(() => {
    if (state && !hasNowPlaying) {
      wantPlay.current = null;
      playerRef.current?.stop();
    }
  }, [state, hasNowPlaying]);

  const ended = state?.status === "ended" || closeReason === "ended";
  const [showFinal, setShowFinal] = useState(false);
  useEffect(() => {
    if (!ended) return;
    playerRef.current?.stop();
    const t = setTimeout(() => setShowFinal(true), AWARDS_SHOW_MS);
    return () => clearTimeout(t);
  }, [ended]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onReaction = useCallback(
    (l: Parameters<RoomClient["onReaction"]>[0]) => client?.onReaction(l) ?? (() => {}),
    [client],
  );

  if (closeReason === "kicked" || (status === "closed" && !ended)) {
    return (
      <div style={center}>
        <h1>Can't reach this party</h1>
        <p>It may have ended or been removed.</p>
        <button style={bigBtn} onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (ended && showFinal) {
    return (
      <div style={center}>
        <h1 style={{ fontSize: 56, margin: 0 }}>The party has ended</h1>
        <p style={{ opacity: 0.7, fontSize: 24 }}>Thanks for singing!</p>
      </div>
    );
  }

  return (
    <div style={page} data-testid="tv-page">
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, visibility: "hidden", pointerEvents: "none" }}>
        <div ref={targetRef} />
      </div>
      {/* Swallows the mouse so YouTube's hover UI (title bar, pause button, share) never shows over the song. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 5 }} />
      {started && state && <TvLayer state={state} onReaction={onReaction} />}
      {!started && (
        <div style={{ ...center, zIndex: 10 }}>
          <h1 style={{ fontSize: 40, margin: 0 }}>Karaoke Tube</h1>
          <button
            style={bigBtn}
            data-testid="tv-start"
            onClick={() => {
              setStarted(true);
              fullscreen();
            }}
          >
            Start the party on this screen
          </button>
          <p style={{ opacity: 0.6 }}>{status === "open" ? "Connected. Drag this window to the TV, then press Start." : "Connecting…"}</p>
        </div>
      )}
      {started && (
        <button
          onClick={fullscreen}
          title="Full screen (F)"
          aria-label="Full screen"
          style={{ position: "absolute", right: 12, bottom: 12, zIndex: 70, opacity: 0.25, background: "#000a", color: "#fff", border: 0, borderRadius: 8, padding: 8, cursor: "pointer" }}
        >
          <Maximize size={18} />
        </button>
      )}
    </div>
  );
}
