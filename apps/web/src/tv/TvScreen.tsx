import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Maximize } from "lucide-react";
import { createRoomClient, screenCredentials } from "@karaoke-tube/client";
import { TV_BAR_PERCENT, serverNow, type QueueItem, type RoomClient, type RoomLanguage, type ServerMessage } from "@karaoke-tube/shared";
import { normalizeRoomCode } from "@karaoke-tube/shared";
import { useParams } from "react-router";
import { SessionLanguage, useT } from "@karaoke-tube/ui";
import { adoptHostLink, hasCredentials } from "../host/client";
import { isPhoneDevice } from "../host/phone";
import { resumableHostRoom } from "../session";
import { SamePhoneWarning } from "./SamePhoneWarning";
import { TvPlayer } from "./player";
import { TvLayer } from "./TvLayer";
import { Lobby } from "./Lobby";
import { clearScreen, loadScreen } from "./screenStore";
import { useWakeLock } from "./useWakeLock";
import { useJoinShown } from "../useJoinShown";

const AWARDS_SHOW_MS = 60_000;

const page = { position: "fixed", inset: 0, height: "100dvh", background: "#000", color: "#fff", overflow: "hidden", fontFamily: '"Figtree", system-ui, sans-serif' } as const;

const center = { ...page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 } as const;
const bigBtn = { font: "inherit", fontWeight: 800, fontSize: 24, padding: "16px 32px", borderRadius: 999, border: 0, background: "#ff4f8b", color: "#1f0711", cursor: "pointer" } as const;

function fullscreen() {
  const d = document;
  if (d.fullscreenElement) void d.exitFullscreen().catch(() => {});
  else void d.documentElement.requestFullscreen?.().catch(() => {});
}

/** /tv/:code: the party's TV screen. Plays the queue with the YouTube IFrame API; the host app remote-controls it. */
export function TvScreen() {
  const t = useT();
  const code = normalizeRoomCode(useParams().code ?? "");
  // Before creating the client: it rejoins with the credentials the host app's link carries (#m=..&k=..).
  // A paired screen (its own key) comes first; the host app's link (the host's login) still works too.
  // Opened from the host app ("Open TV"): the link's login wins over a saved screen key, which may be stale
  // (the screen was removed or replaced while this window was closed) and would send the TV back to the code page.
  const hostLink = useMemo(() => adoptHostLink(code), [code]);
  const screenKey = useMemo(() => {
    const s = loadScreen();
    return !hostLink && s && s.code === code ? s.key : null;
  }, [code, hostLink]);
  const allowed = screenKey !== null || hasCredentials(code);
  if (!allowed) {
    return (
      <div style={center}>
        <h1>{t("tv.notLinked")}</h1>
        <p>{t("tv.notLinkedHint")}</p>
        <a style={{ color: "#ff4f8b" }} href={`/host/${code}`}>
          {t("tv.goHost")}
        </a>
        <a style={{ color: "#ff4f8b" }} href="/tv">
          {t("tv.pairThis")}
        </a>
      </div>
    );
  }
  // The host's own phone (this browser holds the host's login for this party, or the page was opened with it): a phone freezes this tab the
  // moment the host goes back to the host panel, so the TV does not start here, even if this phone was paired as a screen earlier.
  // A different phone or tablet paired with a code is fine.
  if (isPhoneDevice() && (screenKey === null || resumableHostRoom() === code)) return <SamePhoneWarning code={code} />;
  return <Tv code={code} screenKey={screenKey} />;
}

/** The TV speaks the session's language (known once the room's first state arrives), not the TV browser's. */
function Tv({ code, screenKey }: { code: string; screenKey: string | null }) {
  const [lang, setLang] = useState<RoomLanguage | undefined>();
  return (
    <SessionLanguage lang={lang}>
      <TvBody code={code} screenKey={screenKey} onLanguage={setLang} />
    </SessionLanguage>
  );
}

function TvBody({ code, screenKey, onLanguage }: { code: string; screenKey: string | null; onLanguage: (l: RoomLanguage | undefined) => void }) {
  const t = useT();
  const [started, setStarted] = useState(false);
  const clientRef = useRef<RoomClient | null>(null);
  const playerRef = useRef<TvPlayer | null>(null);
  const wantPlay = useRef<QueueItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<RoomClient | null>(null);
  const [replaced, setReplaced] = useState(false);

  const startAtFor = (item: QueueItem): number => {
    const state = clientRef.current?.state;
    if (!state || state.nowPlaying?.id !== item.id) return 0;
    const pb = state.playback;
    if (pb.state === "playing") return pb.positionSec + Math.max(0, serverNow() - pb.updatedAt) / 1000;
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
      } else if (msg.type === "player_replaced") {
        // Another TV window took over. Stop here and don't reconnect, or the two would keep taking it back from each other.
        playerRef.current?.stop();
        setReplaced(true);
        clientRef.current?.close();
      } else if (msg.type === "screen_removed") {
        // The host removed this screen (or paired another): back to showing a code.
        clearScreen();
        location.replace("/tv");
      }
    };
    const c = createRoomClient({ code, player: true, onServerMessage, ...(screenKey ? { credentials: screenCredentials(screenKey) } : {}) });
    clientRef.current = c;
    setClient(c);
    return () => {
      c.close();
      clientRef.current = null;
      setClient(null);
    };
  }, [code, screenKey]);

  const subscribe = useCallback((l: () => void) => client?.subscribe(l) ?? (() => {}), [client]);
  const state = useSyncExternalStore(subscribe, () => client?.state ?? null);
  // "Show code on TV" from a host: the join QR + code show over the song for a while (and "Hide code" ends it early).
  const flash = useJoinShown(state?.joinShownUntil);
  const status = useSyncExternalStore(subscribe, () => client?.status ?? "connecting");
  const closeReason = useSyncExternalStore(subscribe, () => client?.closeReason ?? null);
  const roomLanguage = state?.settings.language;
  useEffect(() => {
    if (roomLanguage) onLanguage(roomLanguage);
  }, [roomLanguage, onLanguage]);

  // Create the YouTube player after the Start click.
  const [playerReady, setPlayerReady] = useState(false);
  // Phones start the video muted (the only autoplay they allow) until someone taps "Tap for sound".
  const [muted, setMuted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A phone or tablet used as the TV (cast / mirrored to a real one) must not dim and sleep while the party runs.
  useWakeLock(started);
  const touch = useMemo(() => window.matchMedia("(pointer: coarse)").matches, []);
  const [portrait, setPortrait] = useState(() => window.matchMedia("(orientation: portrait)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const on = () => setPortrait(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (!started || !wrapRef.current || !targetRef.current) return;
    const report = (event: "started" | "progress" | "ended" | "error", itemId: string, positionSec?: number, durationSec?: number) =>
      clientRef.current?.send({ type: "player_event", event, itemId, positionSec, durationSec });
    const p = new TvPlayer(targetRef.current, wrapRef.current, report, () => setPlayerReady(true), touch, setMuted, (why) => {
      setProblem(why);
      setTimeout(() => setProblem(null), 30_000);
    });
    playerRef.current = p;
    // A TV reopened while the song is paused must come up paused (the room's `pause` command reached us before the player existed).
    if (wantPlay.current) p.play(wantPlay.current, startAtFor(wantPlay.current), clientRef.current?.state?.playback.state === "paused");
    return () => {
      p.dispose();
      playerRef.current = null;
      setPlayerReady(false);
      setMuted(false);
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

  // This screen's pairing is no longer valid (removed while it was offline): show a fresh code.
  useEffect(() => {
    if (screenKey && closeReason === "forgotten") {
      clearScreen();
      location.replace("/tv");
    }
  }, [screenKey, closeReason]);

  // Bar layout: the video gets a box of its own above the bar. Full-screen ("clean") keeps the overlay look.
  const barPct = !state?.settings.tvHideBar && (state?.settings.tvLayout ?? "bar") === "bar" ? TV_BAR_PERCENT[state?.settings.tvBarSize ?? "medium"] : 0;

  const ended = state?.status === "ended" || closeReason === "ended";
  const [showFinal, setShowFinal] = useState(false);
  useEffect(() => {
    if (!ended) return;
    playerRef.current?.stop();
    if (screenKey) clearScreen(); // the party is over: next time this TV opens it asks to be paired again
    const t = setTimeout(() => setShowFinal(true), AWARDS_SHOW_MS);
    return () => clearTimeout(t);
  }, [ended, screenKey]);

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

  if (replaced) {
    return (
      <div style={center} data-testid="tv-replaced">
        <h1>{t("tv.replaced")}</h1>
        <p>{t("tv.replacedHint")}</p>
        <button style={bigBtn} onClick={() => location.reload()}>
          {t("tv.useThis")}
        </button>
      </div>
    );
  }
  if (closeReason === "kicked" || (status === "closed" && !ended)) {
    return (
      <div style={center}>
        <h1>{t("host.cantReach")}</h1>
        <p>{t("tv.cantReachHint")}</p>
        <button style={bigBtn} onClick={() => location.reload()}>
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }
  if (ended && showFinal) {
    return (
      <div style={center}>
        <h1 style={{ fontSize: 56, margin: 0 }}>{t("host.ended")}</h1>
        <p style={{ opacity: 0.7, fontSize: 24 }}>{t("tv.thanksSinging")}</p>
      </div>
    );
  }

  return (
    <div style={page} data-testid="tv-page">
      {/* The video: full screen, or (bar layout) a 16:9 box above the bar, so nothing covers the lyrics. */}
      <div style={barPct ? { position: "absolute", inset: `0 0 ${barPct}dvh 0`, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" } : { position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          ref={wrapRef}
          style={
            barPct
              ? { width: `min(100vw, calc((100dvh - ${barPct}dvh) * 16 / 9))`, height: `min(calc(100dvh - ${barPct}dvh), calc(100vw * 9 / 16))`, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }
              : { position: "absolute", inset: 0, visibility: "hidden", pointerEvents: "none" }
          }
        >
          <div ref={targetRef} />
        </div>
      </div>
      {/* Swallows the mouse so YouTube's hover UI (title bar, pause button, share) never shows over the song. */}
      <div style={{ position: "absolute", inset: 0, zIndex: 5 }} />
      {started && state && <TvLayer state={state} onReaction={onReaction} flash={flash} />}
      {(!started || (state && !ended && !state.recap && !state.nowPlaying && state.playback.state === "idle")) && (
        <Lobby
          code={code}
          members={state?.members ?? []}
          action={
            !started && (
              <button
                style={{ ...bigBtn, fontSize: "max(18px, 4dvh)", padding: "max(10px, 2dvh) max(24px, 6dvh)" }}
                data-testid="tv-start"
                onClick={() => {
                  setStarted(true);
                  fullscreen();
                }}
              >
                {t("tv.start")}
              </button>
            )
          }
          hint={
            !started && (
              <>
                <p style={{ opacity: 0.6, margin: 0 }}>{status === "open" ? t("tv.connected") : t("tv.connecting")}</p>
                {touch && <p style={{ opacity: 0.6, margin: 0, maxWidth: "80vw" }}>{t("tv.castHint")}</p>}
                {touch && <p style={{ opacity: 0.85, margin: 0, maxWidth: "80vw", fontWeight: 700 }}>{t("tv.keepOpen")}</p>}
                {touch && portrait && <p style={{ color: "#ff4f8b", fontWeight: 700, margin: 0 }}>{t("tv.rotate")}</p>}
              </>
            )
          }
        />
      )}
      {/* Connection to the party lost: a big banner, so nobody wonders why the queue does not move. */}
      {started && status === "reconnecting" && (
        <div role="alert" data-testid="tv-reconnecting" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 80, padding: "2.4vh 4vw", background: "#ff5c5c", color: "#1f0711", textAlign: "center", fontWeight: 800, fontSize: "4.4vh" }}>
          {t("host.reconnecting")}
        </div>
      )}
      {started && problem && (
        <div data-testid="tv-problem" style={{ position: "absolute", left: 12, bottom: 12, zIndex: 90, maxWidth: "70vw", padding: "6px 10px", borderRadius: 8, background: "#000c", color: "#ffb4b4", fontSize: 14 }}>
          {problem}
        </div>
      )}
      {started && muted && (
        <button
          style={{ ...bigBtn, position: "absolute", right: 12, top: 12, zIndex: 90, minHeight: 44, fontSize: 16, padding: "10px 18px", whiteSpace: "nowrap" }}
          data-testid="tv-unmute"
          onClick={() => playerRef.current?.unmute()}
        >
          🔊 {t("tv.tapForSound")}
        </button>
      )}
      {started && (
        <button
          onClick={fullscreen}
          title={t("tv.fullscreen")}
          aria-label={t("tv.fullscreenLabel")}
          style={{ position: "absolute", right: 8, bottom: 8, zIndex: 70, opacity: 0.4, background: "#000a", color: "#fff", border: 0, borderRadius: 8, width: 44, height: 44, display: "grid", placeItems: "center", cursor: "pointer" }}
        >
          <Maximize size={18} />
        </button>
      )}
    </div>
  );
}
