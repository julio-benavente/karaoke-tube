import { formatRoomCode } from "@karaoke-tube/shared";
import { ChevronDown, MonitorPlay, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { REACTIONS, REACTION_EMOJI, type Reaction } from "@karaoke-tube/shared";
import {
  SongArt,
  AvatarStack,
  IconButton,
  PlayButton,
  ProgressBar,
  Sheet,
  hueOf,
  singerLabel,
  singerSeeds,
  songParts,
  isWaitingForTv,
  useCountdown,
  usePlaybackPosition,
  useReactions,
  useRoom,
  useT,
  reactionName,
  ExplicitBadge,
} from "@karaoke-tube/ui";
import { RemoteVideo } from "../watch/RemoteVideo";
import { WATCH_HERE, useWatchPref } from "../watch/pref";
import css from "./NowSinging.module.css";

/** G6: full-screen now singing: big artwork, progress, reactions, host controls. */
export function NowSingingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { state } = useRoom();
  const item = state?.nowPlaying;
  const hue = item ? hueOf(item.song.videoId) : 330;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={t("queue.nowSinging")}
      size="full"
      style={{ background: `linear-gradient(180deg, hsl(${hue} 45% 32%) 0%, hsl(${hue} 40% 14%) 55%, var(--kt-base) 100%)` }}
    >
      <NowSingingBody onClose={onClose} />
    </Sheet>
  );
}

function NowSingingBody({ onClose }: { onClose: () => void }) {
  const { state, me, isHost, send } = useRoom();
  const t = useT();
  const { recent } = useReactions(2600);
  const item = state?.nowPlaying;
  const playback = state?.playback;
  const position = usePlaybackPosition(playback, item?.song.durationSec);
  const countdown = useCountdown(playback?.state === "get_ready" ? playback.countdownEndsAt : null);
  const [watchPref, setWatching] = useWatchPref();
  const watching = WATCH_HERE && watchPref;
  const [cooldown, setCooldown] = useState(false);
  const [popped, setPopped] = useState<Reaction | null>(null);

  useEffect(() => {
    if (!popped) return;
    const t = setTimeout(() => setPopped(null), 300);
    return () => clearTimeout(t);
  }, [popped]);

  if (!state || !item || !playback || !me) return null;
  const parts = songParts(item.song);
  const singer = state.members.find((m) => m.id === item.singerIds[0]);
  const playing = playback.state === "playing";
  const reactionsOn = state.settings.reactions;

  const react = (r: Reaction) => {
    if (cooldown) return;
    send({ type: "react", reaction: r });
    setPopped(r);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 150); // the room drops reactions closer than 150 ms
  };

  return (
    <div className={css.body}>
      <header className={css.top}>
        <IconButton label={t("common.close")} onClick={onClose}>
          <ChevronDown size={28} />
        </IconButton>
        <div className={css.topText}>
          <span className={css.kicker}>{t("queue.nowSinging")}</span>
          <span className={css.code}>{t("now.party", { code: formatRoomCode(state.code) })}</span>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <div className={`${css.artBox} ${watching ? css.watchBox : ""}`}>
        {watching ? (
          <RemoteVideo item={item} playback={playback} />
        ) : (
          <SongArt song={item.song} radius="md" shadow className={css.art} />
        )}
        {playback.state === "get_ready" && (
          <div className={css.getReady}>
            <span>{t("now.getReady")}</span>
            {isWaitingForTv(playback) ? <b>{t("now.waitingTv")}</b> : <b data-countdown={countdown}>{countdown}</b>}
          </div>
        )}
        <div className={css.floating} aria-hidden>
          {recent.map((r) => (
            <span key={r.id} className={css.float} style={{ left: `${10 + ((r.id * 37) % 80)}%` }}>
              {REACTION_EMOJI[r.reaction]}
            </span>
          ))}
        </div>
      </div>

      {WATCH_HERE && (
        <>
          <button type="button" className={css.watchBtn} aria-pressed={watching} onClick={() => setWatching(!watching)}>
            <MonitorPlay size={18} />
            {watching ? t("watch.off") : t("watch.on")}
          </button>
          {!watching && <p className={css.watchHint}>{t("watch.hint")}</p>}
        </>
      )}

      <div className={css.meta}>
        <div className={css.titleBlock}>
          <h2 className={css.title}>{parts.title}</h2>
          <p className={css.artist}>
            <ExplicitBadge song={item.song} />
            {parts.artist}
          </p>
        </div>
      </div>
      <div className={css.singer}>
        {singer && !item.everyone && <AvatarStack seeds={singerSeeds(item, state.members)} size={28} />}
        <span>
          🎤 <b>{singerLabel(item, state.members, me.id, t)}</b>
          {playback.state === "paused" && <span className={css.paused}> · {t("now.paused")}</span>}
        </span>
      </div>

      <ProgressBar value={position} max={item.song.durationSec} showTimes className={css.progress} />

      {isHost && (
        <div className={css.controls}>
          <IconButton label={t("player.restart")} size="lg" onClick={() => send({ type: "restart" })}>
            <RotateCcw size={26} />
          </IconButton>
          <PlayButton
            playing={playing}
            size={64}
            className={css.play}
            onClick={() => send({ type: playing ? "pause" : "resume" })}
            label={playing ? t("player.pause") : t("player.resume")}
          />
          <IconButton label={t("player.skip")} size="lg" onClick={() => send({ type: "skip" })}>
            <SkipForward size={30} fill="currentColor" />
          </IconButton>
        </div>
      )}

      <div className={css.reactions} role="group" aria-label={t("now.reactions")}>
        {REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            className={`${css.reaction} ${popped === r ? css.popped : ""}`}
            onClick={() => react(r)}
            disabled={!reactionsOn}
            aria-label={t("now.react", { name: reactionName(t, r) })}
          >
            {REACTION_EMOJI[r]}
          </button>
        ))}
      </div>
      {!reactionsOn && <p className={css.off}>{t("now.reactionsOff")}</p>}
    </div>
  );
}
