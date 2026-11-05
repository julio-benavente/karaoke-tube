import clsx from "clsx";
import type { ReactNode } from "react";
import { Artwork } from "./Artwork";
import { PlayButton } from "./Button";
import { useT } from "../i18n/context";
import css from "./Tile.module.css";

/** Same text always gets the same number, so a category keeps its pattern. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const LIGHT = "rgba(255,255,255,0.12)";
const DARK = "rgba(0,0,0,0.09)";

/** Bold geometric patterns for the cover, in SVG (no image files). `n` picks one and a small variation of it. */
function MixPattern({ seed }: { seed: string }) {
  const h = hash(seed);
  const kind = h % 6;
  const v = (h >> 4) % 3; // which corner / offset
  const flip = v === 1 ? "scale(-1,1) translate(-100,0)" : v === 2 ? "scale(1,-1) translate(0,-100)" : undefined;
  let art;
  switch (kind) {
    case 0: // concentric rings
      art = (
        <>
          <circle cx="78" cy="30" r="52" fill={LIGHT} />
          <circle cx="78" cy="30" r="36" fill={DARK} />
          <circle cx="78" cy="30" r="20" fill={LIGHT} />
        </>
      );
      break;
    case 1: // diagonal stripes
      art = (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon key={i} points={`${i * 26 - 20},0 ${i * 26 + 2},0 ${i * 26 + 62},100 ${i * 26 + 40},100`} fill={i % 2 ? DARK : LIGHT} />
          ))}
        </>
      );
      break;
    case 2: // dot grid
      art = (
        <>
          {Array.from({ length: 25 }, (_, i) => (
            <circle key={i} cx={14 + (i % 5) * 18} cy={12 + Math.floor(i / 5) * 18} r={i % 2 ? 6 : 8} fill={i % 3 ? LIGHT : DARK} />
          ))}
        </>
      );
      break;
    case 3: // big triangles
      art = (
        <>
          <polygon points="100,0 100,80 20,0" fill={LIGHT} />
          <polygon points="100,0 100,48 52,0" fill={DARK} />
          <polygon points="0,100 46,100 0,54" fill={LIGHT} />
        </>
      );
      break;
    case 4: // quarter arcs
      art = (
        <>
          <path d="M100 0 A90 90 0 0 0 10 90 L100 90 Z" fill={LIGHT} />
          <path d="M100 0 A62 62 0 0 0 38 62 L100 62 Z" fill={DARK} />
          <path d="M100 0 A34 34 0 0 0 66 34 L100 34 Z" fill={LIGHT} />
        </>
      );
      break;
    default: // diamonds
      art = (
        <>
          <rect x="50" y="-8" width="46" height="46" transform="rotate(45 73 15)" fill={LIGHT} />
          <rect x="22" y="22" width="34" height="34" transform="rotate(45 39 39)" fill={DARK} />
          <rect x="62" y="48" width="26" height="26" transform="rotate(45 75 61)" fill={LIGHT} />
        </>
      );
  }
  return (
    <svg className={css.pattern} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <g transform={flip}>{art}</g>
    </svg>
  );
}

/**
 * "Mix" card for categories (genres, decades, moods): a rounded square in the category's colour with a bold pattern,
 * the name big at the bottom left, a lighter strip along the bottom edge and a short grey description underneath.
 */
export function Tile({
  title,
  color,
  description,
  id,
  pattern,
  onClick,
  className,
}: {
  title: string;
  /** Any CSS colour, usually a `var(--kt-tile-N)`. */
  color: string;
  /** One short line under the card. */
  description?: string;
  /** Picks the pattern; the same id always gets the same one. Defaults to the title. */
  id?: string;
  /** Your own pattern for the cover (SVG shapes on a 100 x 100 canvas) instead of the generated one. */
  pattern?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={clsx(css.mix, className)} onClick={onClick} data-testid="mix-card">
      <span className={css.cover} style={{ background: color, ["--strip" as string]: `color-mix(in oklab, ${color} 78%, white)` }}>
        {pattern ? (
          <svg className={css.pattern} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
            {pattern}
          </svg>
        ) : (
          <MixPattern seed={id ?? title} />
        )}
        <span className={css.mixTitle}>{title}</span>
        <span className={css.strip} aria-hidden />
      </span>
      {description && <span className={css.mixDesc}>{description}</span>}
    </button>
  );
}

/** Home shortcut tile: artwork on the left, bold title, play button on hover. */
export function ShortcutTile({
  title,
  image,
  art,
  label,
  onClick,
  onPlay,
  playLabel,
  trailing,
}: {
  title: string;
  image?: string;
  /** Replaces the image: any picture, e.g. a song's poster or generated cover. */
  art?: ReactNode;
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
      {art ? <span className={clsx(css.shortcutArt, css.shortcutArtSlot)}>{art}</span> : <Artwork src={image} label={label ?? title} className={css.shortcutArt} radius="none" />}
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
