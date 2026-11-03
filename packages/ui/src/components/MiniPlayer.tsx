import type { Member, Playback, QueueItem } from "@karaoke-tube/shared";
import { Pause, Play } from "lucide-react";
import { songParts } from "../format";
import { useCountdown, usePlaybackPosition } from "../hooks/room";
import { Artwork, tintOf } from "./Artwork";
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
};

/** Phone mini player above the tabs, tinted by the song. Tap opens the now-singing sheet. */
export function MiniPlayer({ item, playback, members, onOpen, onToggle }: MiniPlayerProps) {
  const position = usePlaybackPosition(playback, item.song.durationSec);
  const countdown = useCountdown(playback.state === "get_ready" ? playback.countdownEndsAt : null);
  const { title } = songParts(item.song);
  const playing = playback.state === "playing";
  return (
    <div className={css.mini} style={{ background: tintOf(item.song.videoId) }}>
      <button type="button" className={css.hit} onClick={onOpen} aria-label="Open now singing" />
      <Artwork src={item.song.thumbnailUrl} label={item.song.title} size={40} className={css.art} />
      <div className={css.text}>
        <div className={css.title}>{title}</div>
        <div className={css.sub}>
          {playback.state === "get_ready" ? (
            <>
              Up now: <b>{singerNames(item, members)}</b> · starts in {countdown}
            </>
          ) : (
            <>
              <span className={css.mic}>🎤</span> {singerNames(item, members)}
            </>
          )}
        </div>
      </div>
      {onToggle && (
        <button type="button" className={css.toggle} onClick={onToggle} aria-label={playing ? "Pause" : "Resume"}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
      )}
      <ProgressBar value={position} max={item.song.durationSec} variant="thin" className={css.progress} />
    </div>
  );
}
