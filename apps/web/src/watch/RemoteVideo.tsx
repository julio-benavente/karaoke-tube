import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { serverNow, type Playback, type QueueItem } from "@karaoke-tube/shared";
import { loadApi, type YTPlayer } from "../tv/player";
import css from "./RemoteVideo.module.css";

/** Off by this much (seconds) and the video jumps back in step with the room. */
const DRIFT_SEC = 2.5;
const CHECK_MS = 1500;
// YT.PlayerState
const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;
const CUED = 5;

/** Where the room's song is right now, in seconds (the server clock stands in for ours). */
function expectedPosition(pb: Playback): number {
  return pb.state === "playing" ? pb.positionSec + Math.max(0, serverNow() - pb.updatedAt) / 1000 : pb.positionSec;
}

/**
 * The karaoke video on this device, kept in step with the room: follows play / pause / restart / skip and
 * corrects drift. Nothing here is sent to the room: it only watches `playback`. Lets people who aren't in front
 * of the TV (another room, another city) see the lyrics.
 */
export function RemoteVideo({ item, playback, className }: { item: QueueItem; playback: Playback; className?: string }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const loadedId = useRef<string | null>(null);
  // Latest props for the timers, which outlive renders.
  const latest = useRef({ item, playback });
  latest.current = { item, playback };

  useEffect(() => {
    let dead = false;
    let player: YTPlayer | null = null;
    loadApi()
      .then((YT) => {
        if (dead || !targetRef.current) return;
        player = new YT.Player(targetRef.current, {
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1 },
          events: {
            onReady: () => {
              if (dead) return;
              ytRef.current = player;
              setReady(true);
            },
            onStateChange: () => sync(false),
          },
        });
      })
      .catch(() => {});
    return () => {
      dead = true;
      ytRef.current = null;
      loadedId.current = null;
      try {
        player?.destroy();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Bring the video in line with the room. `force` seeks even when the drift is small (after a state change). */
  function sync(force: boolean) {
    const yt = ytRef.current;
    if (!yt) return;
    const { item: it, playback: pb } = latest.current;
    const want = expectedPosition(pb);
    if (loadedId.current !== it.song.videoId + it.id) {
      loadedId.current = it.song.videoId + it.id;
      if (pb.state === "get_ready" || pb.state === "idle") yt.cueVideoById({ videoId: it.song.videoId, startSeconds: 0 });
      else yt.loadVideoById({ videoId: it.song.videoId, startSeconds: Math.floor(want) });
      if (pb.state === "paused") setTimeout(() => yt.pauseVideo(), 600);
      return;
    }
    const s = yt.getPlayerState();
    if (pb.state === "playing") {
      if (s === PAUSED || s === CUED || s === -1) yt.playVideo();
      if (s !== BUFFERING && (force || Math.abs(yt.getCurrentTime() - want) > DRIFT_SEC)) yt.seekTo(want, true);
    } else if (pb.state === "paused") {
      if (s === PLAYING || s === BUFFERING) yt.pauseVideo();
      if (Math.abs(yt.getCurrentTime() - want) > 1) yt.seekTo(want, true);
    } else if (s === PLAYING) {
      yt.pauseVideo(); // get ready: hold at the start until the song begins
    }
  }

  // Every room change: follow it right away.
  useEffect(() => {
    if (ready) sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, item.id, item.song.videoId, playback.state, playback.positionSec, playback.updatedAt]);

  // Between changes: correct drift, and notice when the browser refused to autoplay.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      sync(false);
      const yt = ytRef.current;
      const { playback: pb } = latest.current;
      if (!yt) return;
      const s = yt.getPlayerState();
      setNeedsTap(pb.state === "playing" && (s === PAUSED || s === CUED || s === -1) && serverNow() - pb.updatedAt > 3000);
    }, CHECK_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const yt = ytRef.current;
    if (!ready || !yt) return;
    if (muted) yt.mute();
    else yt.unMute();
  }, [muted, ready]);

  return (
    <div className={`${css.box} ${className ?? ""}`} data-testid="remote-video">
      <div className={css.frame}>
        <div ref={targetRef} />
      </div>
      {/* Swallows touches so YouTube's own controls can't pause this copy out of step with the room. */}
      <div className={css.shield} />
      {needsTap && (
        <button
          type="button"
          className={css.tap}
          onClick={() => {
            ytRef.current?.playVideo();
            sync(true);
            setNeedsTap(false);
          }}
        >
          <Play size={28} fill="currentColor" />
          Tap to play
        </button>
      )}
      <button type="button" className={css.mute} onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
        {muted ? "🔇 Sound off" : "🔊 Sound on"}
      </button>
    </div>
  );
}
