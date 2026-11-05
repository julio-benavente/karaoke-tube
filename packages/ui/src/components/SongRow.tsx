import clsx from "clsx";
import { CircleCheck, CirclePlus, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Song } from "@karaoke-tube/shared";
import { formatTime, songParts } from "../format";
import { useT } from "../i18n/context";
import { ExplicitBadge } from "./ExplicitBadge";
import { SongArt } from "./SongCard";
import css from "./Rows.module.css";

export type SongRowProps = {
  song: Song;
  /** Shows ⊕; becomes ✓ when `added`. */
  onAdd?: () => void;
  added?: boolean;
  adding?: boolean;
  onClick?: () => void;
  /** Show the duration on wide screens. */
  showDuration?: boolean;
  index?: number;
  trailing?: ReactNode;
};

/** Search result / song list row: artwork, title, artist, ⊕ add. */
export function SongRow({ song, onAdd, added, adding, onClick, showDuration = true, index, trailing }: SongRowProps) {
  const t = useT();
  const { title, artist } = songParts(song);
  return (
    <div className={css.row}>
      <button type="button" className={css.hit} onClick={onClick ?? onAdd} aria-label={t("song.by", { title, artist })} />
      {index !== undefined && <span className={css.index}>{index}</span>}
      <SongArt song={song} size={48} className={css.art} />
      <div className={css.text}>
        <div className={css.title}>{title}</div>
        <div className={css.sub}>
          <ExplicitBadge song={song} />
          <span className={css.artist}>{artist}</span>
        </div>
      </div>
      {showDuration && <span className={css.duration}>{formatTime(song.durationSec)}</span>}
      {trailing}
      {onAdd && (
        <button
          type="button"
          className={clsx(css.action, added && css.added)}
          onClick={onAdd}
          disabled={adding}
          aria-label={added ? t("song.addAgain", { title }) : t("song.addNamed", { title })}
          title={added ? t("song.inQueue") : t("home.add")}
        >
          {adding ? <LoaderCircle className={css.spin} /> : added ? <CircleCheck /> : <CirclePlus />}
        </button>
      )}
    </div>
  );
}
