import type { Member, Playback, QueueItem } from "@karaoke-tube/shared";
import { Pause, Play, SkipForward } from "lucide-react";
import { songParts } from "../format";
import { useT } from "../i18n/context";
import { isWaitingForTv, useCountdown, usePlaybackPosition } from "../hooks/room";
import { tintOf } from "./Artwork";
import { SongArt } from "./SongCard";
import { ProgressBar } from "./ProgressBar";
import { singerNames } from "./QueueRow";
import css from "./MiniPlayer.module.css";

export type MiniPlayerProps = {
  item: QueueItem;
  playback: Playback;
  members: Member[];
  onOpen: () => void;
  /** Host only: pause/resume button on the right. */
  onToggle?: () => void;
  /** Host only: skip to the next song (the desktop play bar has the same button). */
  onSkip?: () => void;
};

/** Phone mini player above the tabs, tinted by the song. Tap opens the now-singing sheet. */
export function MiniPlayer({ item, playback, members, onOpen, onToggle, onSkip }: MiniPlayerProps) {
  const t = useT();
  const position = usePlaybackPosition(playback, item.song.durationSec);
  const countdown = useCountdown(playback.state === "get_ready" ? playback.countdownEndsAt : null);
  const { title } = songParts(item.song);
  const playing = playback.state === "playing";
  return (
    <div className={css.mini} style={{ background: tintOf(item.song.videoId) }}>
      <button type="button" className={css.hit} onClick={onOpen} aria-label={t("player.openNow")} />
      <SongArt song={item.song} size={40} explicit={item.song.explicit} className={css.art} />
      <div className={css.text}>
        <div className={css.title}>{title}</div>
        <div className={css.sub} data-countdown={playback.state === "get_ready" && !isWaitingForTv(playback) ? countdown : undefined}>
          {playback.state === "get_ready" ? (
            <>
              {t("mini.upNow")} <b>{singerNames(item, members, t)}</b> · {isWaitingForTv(playback) ? t("now.waitingTv") : t("mini.startsIn", { n: countdown })}
            </>
          ) : (
            <>
              <span className={css.mic}>🎤</span> {singerNames(item, members, t)}
            </>
          )}
        </div>
      </div>
      {onToggle && (
        <button type="button" className={css.toggle} onClick={onToggle} aria-label={playing ? t("player.pause") : t("player.resume")}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
      )}
      {onSkip && (
        <button type="button" className={css.toggle} onClick={onSkip} aria-label={t("player.skip")} data-testid="mini-skip">
          <SkipForward fill="currentColor" />
        </button>
      )}
      <ProgressBar value={position} max={item.song.durationSec} variant="thin" className={css.progress} />
    </div>
  );
}
