import clsx from "clsx";
import type { ReactNode } from "react";
import { Artwork } from "./Artwork";
import { PlayButton } from "./Button";
import { useT } from "../i18n/context";
import css from "./Tile.module.css";

/** "Browse all" colour tile: bold title top-left, tilted artwork bottom-right. */
export function Tile({
  title,
  color,
  image,
  onClick,
  className,
}: {
  title: string;
  /** Any CSS colour, usually a `var(--kt-tile-N)`. */
  color: string;
  image?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={clsx(css.tile, className)} style={{ background: color }} onClick={onClick}>
      <span className={css.title}>{title}</span>
      <Artwork src={image} label={title} className={css.art} radius="xs" />
    </button>
  );
}

/** Home shortcut tile: artwork on the left, bold title, play button on hover. */
export function ShortcutTile({
  title,
  image,
  label,
  onClick,
  onPlay,
  playLabel,
  trailing,
}: {
  title: string;
  image?: string;
  /** For the artwork fallback colour. */
  label?: string;
  onClick?: () => void;
  onPlay?: () => void;
  playLabel?: string;
  trailing?: ReactNode;
}) {
  const t = useT();
  return (
    <div className={css.shortcut}>
      <button type="button" className={css.shortcutHit} onClick={onClick} aria-label={title} />
      <Artwork src={image} label={label ?? title} className={css.shortcutArt} radius="none" />
      <span className={css.shortcutTitle}>{title}</span>
      {trailing}
      {onPlay && (
        <span className={css.shortcutPlay}>
          <PlayButton playing={false} size={32} onClick={onPlay} label={playLabel ?? t("home.add")} />
        </span>
      )}
    </div>
  );
}
