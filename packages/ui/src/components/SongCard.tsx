import clsx from "clsx";
import type { Song } from "@karaoke-tube/shared";
import { formatTime, songParts } from "../format";
import { ExplicitBadge } from "./ExplicitBadge";
import css from "./SongCard.module.css";

/** Same text always gives the same number (colour and pattern stay with the song). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const LIGHT = "rgba(255,255,255,0.12)";
const DARK = "rgba(0,0,0,0.09)";

/** Bold geometric cover art in SVG, picked by the song's id. */
function Pattern({ seed }: { seed: string }) {
  const h = hash(seed);
  const kind = h % 6;
  const v = (h >> 4) % 3;
  const flip = v === 1 ? "scale(-1,1) translate(-100,0)" : v === 2 ? "scale(1,-1) translate(0,-100)" : undefined;
  let art;
  switch (kind) {
    case 0:
      art = (
        <>
          <circle cx="78" cy="30" r="52" fill={LIGHT} />
          <circle cx="78" cy="30" r="36" fill={DARK} />
          <circle cx="78" cy="30" r="20" fill={LIGHT} />
        </>
      );
      break;
    case 1:
      art = (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon key={i} points={`${i * 26 - 20},0 ${i * 26 + 2},0 ${i * 26 + 62},100 ${i * 26 + 40},100`} fill={i % 2 ? DARK : LIGHT} />
          ))}
        </>
      );
      break;
    case 2:
      art = (
        <>
          {Array.from({ length: 25 }, (_, i) => (
            <circle key={i} cx={14 + (i % 5) * 18} cy={12 + Math.floor(i / 5) * 18} r={i % 2 ? 6 : 8} fill={i % 3 ? LIGHT : DARK} />
          ))}
        </>
      );
      break;
    case 3:
      art = (
        <>
          <polygon points="100,0 100,80 20,0" fill={LIGHT} />
          <polygon points="100,0 100,48 52,0" fill={DARK} />
          <polygon points="0,100 46,100 0,54" fill={LIGHT} />
        </>
      );
      break;
    case 4:
      art = (
        <>
          <path d="M100 0 A90 90 0 0 0 10 90 L100 90 Z" fill={LIGHT} />
          <path d="M100 0 A62 62 0 0 0 38 62 L100 62 Z" fill={DARK} />
          <path d="M100 0 A34 34 0 0 0 66 34 L100 34 Z" fill={LIGHT} />
        </>
      );
      break;
    default:
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

export type SongCardVariant = "b" | "c";

/**
 * A song as a generated "mix" card. Colour comes from the title + artist, pattern from the video id.
 *  b: pure generated cover, big title, artist under it, duration chip top right.
 *  c: compact row: small generated cover with the title's initials, text beside it.
 */
export function SongCard({ song, variant = "b", onClick, className }: { song: Song; variant?: SongCardVariant; onClick?: () => void; className?: string }) {
  const { title, artist } = songParts(song);
  const color = `var(--kt-tile-${((hash(`${title}|${artist}`) >>> 5) % 12) + 1})`;
  const style = { background: color, ["--strip" as string]: `color-mix(in oklab, ${color} 78%, white)` };
  const initials = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  if (variant === "c") {
    return (
      <button type="button" className={clsx(css.rowCard, className)} onClick={onClick} data-testid="song-card">
        <span className={css.mini} style={style}>
          <Pattern seed={song.videoId} />
          <span className={css.initials}>{initials}</span>
        </span>
        <span className={css.rowText}>
          <span className={css.rowTitle}>{title}</span>
          <span className={css.rowSub}>
            <ExplicitBadge song={song} />
            <span className={css.ellipsis}>{artist}</span>
          </span>
        </span>
        <span className={css.rowTime}>{formatTime(song.durationSec)}</span>
      </button>
    );
  }

  return (
    <button type="button" className={clsx(css.card, className)} onClick={onClick} data-testid="song-card">
      <span className={css.cover} style={style}>
        <Pattern seed={song.videoId} />
        {variant === "b" && <span className={css.chip}>{formatTime(song.durationSec)}</span>}
        <span className={css.text}>
          <span className={clsx(css.title, variant === "b" && css.titleBig)}>{title}</span>
          <span className={css.artist}>
            <ExplicitBadge song={song} />
            <span className={css.ellipsis}>{artist}</span>
          </span>
        </span>
        <span className={css.strip} aria-hidden />
      </span>
    </button>
  );
}
