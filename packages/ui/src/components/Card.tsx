import clsx from "clsx";
import type { ReactNode } from "react";
import { Artwork } from "./Artwork";
import { PlayButton } from "./Button";
import { useT } from "../i18n/context";
import css from "./Card.module.css";

/** Square artwork card with title + subtitle; a play button slides up on hover. */
export function Card({
  title,
  subtitle,
  image,
  round,
  onClick,
  onPlay,
  playLabel,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  image?: string;
  round?: boolean;
  onClick?: () => void;
  onPlay?: () => void;
  playLabel?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={clsx(css.card, className)}>
      <button type="button" className={css.hit} onClick={onClick ?? onPlay} aria-label={title} />
      <div className={css.artWrap}>
        <Artwork src={image} label={title} shape={round ? "round" : "square"} radius="sm" shadow className={css.art} />
        {onPlay && (
          <span className={css.play}>
            <PlayButton playing={false} size={44} onClick={onPlay} label={playLabel ?? t("home.add")} />
          </span>
        )}
      </div>
      <div className={css.title}>{title}</div>
      {subtitle && <div className={css.subtitle}>{subtitle}</div>}
    </div>
  );
}

/** Section with a title, "Show all" link and a horizontally scrolling row of cards. */
export function Shelf({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx(css.shelf, className)}>
      <header className={css.shelfHead}>
        <h2 className={css.shelfTitle}>{title}</h2>
        {action}
      </header>
      <div className={css.shelfRow}>{children}</div>
    </section>
  );
}
