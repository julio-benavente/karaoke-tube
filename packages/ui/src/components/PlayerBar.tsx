import clsx from "clsx";
import { RotateCcw, SkipForward } from "lucide-react";
import type { ReactNode } from "react";
import type { Member, Playback, QueueItem } from "@karaoke-tube/shared";
import { songParts } from "../format";
import { usePlaybackPosition, useCountdown, isWaitingForTv } from "../hooks/room";
import { Artwork } from "./Artwork";
import { Avatar } from "./Avatar";
import { IconButton, PlayButton } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { singerNames } from "./QueueRow";
import { useT } from "../i18n/context";
import css from "./PlayerBar.module.css";

export type PlayerBarProps = {
  item: QueueItem | null;
  playback: Playback;
  members: Member[];
  /** Host controls. Hidden when not given. */
  onPause?: () => void;
  onResume?: () => void;
  onSkip?: () => void;
  onRestart?: () => void;
  /** Right side: reaction count, lock, "Show on TV", End party… */
  right?: ReactNode;
  onOpen?: () => void;
};

/** Desktop bottom bar: now singing on the left, controls + progress in the middle, extras on the right. */
export function PlayerBar({ item, playback, members, onPause, onResume, onSkip, onRestart, right, onOpen }: PlayerBarProps) {
  const t = useT();
  const position = usePlaybackPosition(playback, item?.song.durationSec);
  const countdown = useCountdown(playback.state === "get_ready" ? playback.countdownEndsAt : null);
  const playing = playback.state === "playing";
  const singer = item ? members.find((m) => m.id === item.singerIds[0]) : undefined;
  const parts = item ? songParts(item.song) : null;
  const controls = !!(onPause || onResume || onSkip || onRestart);

  return (
    <footer className={css.bar}>
      <div className={css.left}>
        {item && parts ? (
          <>
            <button type="button" className={css.artBtn} onClick={onOpen} aria-label={t("player.openNow")}>
              <Artwork src={item.song.thumbnailUrl} label={item.song.title} size={56} />
            </button>
            <div className={css.meta}>
              <div className={css.title}>{parts.title}</div>
              <div className={css.sub}>
                {singer && !item.everyone && <Avatar seed={singer.avatarSeed} size={16} />}
                <span className={css.singer}>{singerNames(item, members, t)}</span>
                <span>·</span>
                <span className={css.artist}>{parts.artist}</span>
              </div>
            </div>
          </>
        ) : (
          <div className={css.idle}>{t("player.nothing")}</div>
        )}
      </div>

      <div className={css.center}>
        {controls && (
          <div className={css.controls}>
            <IconButton label={t("player.restart")} size="sm" onClick={onRestart} disabled={!item}>
              <RotateCcw size={18} />
            </IconButton>
            <PlayButton
              playing={playing || playback.state === "get_ready"}
              size={36}
              className={css.play}
              onClick={playing ? onPause : onResume}
              label={playing ? t("player.pause") : t("player.resume")}
            />
            <IconButton label={t("player.skip")} size="sm" onClick={onSkip} disabled={!item}>
              <SkipForward size={20} fill="currentColor" />
            </IconButton>
          </div>
        )}
        {playback.state === "get_ready" ? (
          <div className={css.getReady}>
            {item ? t("player.getReadyFor", { names: singerNames(item, members, t) }) : t("player.getReady")} {isWaitingForTv(playback) ? <b>{t("now.waitingTv")}</b> : <b data-countdown={countdown}>{countdown}</b>}
          </div>
        ) : (
          <ProgressBar value={position} max={item?.song.durationSec ?? 0} showTimes className={css.progress} />
        )}
      </div>

      <div className={css.right}>{right}</div>
    </footer>
  );
}

export function PlayerBarDivider() {
  return <span className={clsx(css.divider)} aria-hidden />;
}
