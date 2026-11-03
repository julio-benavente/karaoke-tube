import clsx from "clsx";
import { GripVertical, X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import type { Member, QueueItem } from "@karaoke-tube/shared";
import { singerLabel, songParts } from "../format";
import { Artwork } from "./Artwork";
import { AvatarStack } from "./Avatar";
import css from "./Rows.module.css";

export type QueueRowProps = {
  item: QueueItem;
  /** Members, to show singer names and avatars. */
  members: Member[];
  /** "now" shows the equalizer and pink title. */
  playing?: boolean;
  /** Mark as mine (accent singer name). */
  mine?: boolean;
  /** My member id: with `mine`, a duet reads "You & Ben". */
  meId?: string;
  position?: number;
  onRemove?: () => void;
  /** Menu button or other actions. */
  actions?: ReactNode;
  /** Props for the drag handle (dnd-kit listeners/attributes). Shows the handle when set. */
  dragHandle?: HTMLAttributes<HTMLButtonElement>;
  dragging?: boolean;
  compact?: boolean;
};

export function singerNames(item: QueueItem, members: Member[]): string {
  return singerLabel(item, members);
}

/** A song in the queue with its singer. */
export function QueueRow({
  item,
  members,
  playing,
  mine,
  meId,
  position,
  onRemove,
  actions,
  dragHandle,
  dragging,
  compact,
}: QueueRowProps) {
  const { title, artist } = songParts(item.song);
  const singers = item.singerIds.map((id) => members.find((m) => m.id === id));
  return (
    <div className={clsx(css.row, compact && css.compact, dragging && css.dragging)}>
      {dragHandle && (
        <button type="button" className={css.handle} aria-label={`Move ${title}`} {...dragHandle}>
          <GripVertical />
        </button>
      )}
      {position !== undefined && !dragHandle && <span className={css.index}>{position}</span>}
      <div className={css.artBox}>
        <Artwork src={item.song.thumbnailUrl} label={item.song.title} size={compact ? 40 : 48} className={css.art} />
        {playing && (
          <span className={css.eqOverlay} aria-hidden>
            <Equalizer />
          </span>
        )}
      </div>
      <div className={css.text}>
        <div className={clsx(css.title, playing && css.titleNow)}>{title}</div>
        <div className={css.sub}>
          {item.everyone ? (
            <span aria-hidden>🎉</span>
          ) : (
            <AvatarStack seeds={singers.map((m, i) => m?.avatarSeed ?? `x${i}`)} size={16} />
          )}
          <span className={clsx(css.singer, mine && css.mine)}>{mine ? (meId ? singerLabel(item, members, meId) : "You") : singerNames(item, members)}</span>
          <span className={css.dotSep}>·</span>
          <span className={css.artist}>{artist}</span>
        </div>
      </div>
      {actions}
      {onRemove && (
        <button type="button" className={css.action} onClick={onRemove} aria-label={`Remove ${title}`} title="Remove">
          <X />
        </button>
      )}
    </div>
  );
}

/** Animated bars shown on the playing song. Static when reduced motion is on. */
export function Equalizer({ paused }: { paused?: boolean }) {
  return (
    <span className={clsx(css.eq, paused && css.eqPaused)}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
