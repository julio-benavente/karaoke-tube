import clsx from "clsx";
import type { Song } from "@karaoke-tube/shared";
import { formatTime, songParts } from "../format";
import { useHideCovers } from "../hooks/room";
import { useT } from "../i18n/context";
import { Artwork } from "./Artwork";
import { ExplicitBadge } from "./ExplicitBadge";
import css from "./SongCard.module.css";

/** Same text always gives the same number (colour and pattern stay with the song). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Barely-there tints (about 4%) so the shapes whisper against the card colour instead of competing with the title.
const LIGHT = "rgba(255,255,255,0.04)";
const DARK = "rgba(0,0,0,0.04)";

/**
 * Geometric cover art in SVG, picked by the song's id. It fills the whole cover (`size` 1) in very low-contrast tints;
 * a smaller `size` draws it smaller, tucked into the top-right corner.
 */
function Pattern({ seed, size = 1 }: { seed: string; size?: number }) {
  const h = hash(seed);
  const kind = h % 6;
  const v = (h >> 4) % 3;
  const flip = v === 1 ? "scale(-1,1) translate(-100,0)" : v === 2 ? "scale(1,-1) translate(0,-100)" : undefined;
  const fill = (n: number) => (n % 2 ? DARK : LIGHT);
  // Concentric rings around a point, outermost first, wide enough to reach every corner of the square.
  const rings = (cx: number, cy: number, outer: number, step: number) =>
    Array.from({ length: Math.ceil(outer / step) }, (_, i) => <circle key={i} cx={cx} cy={cy} r={outer - i * step} fill={fill(i)} />);
  let art;
  // Every design covers the whole 100x100 square.
  switch (kind) {
    case 0:
      art = <>{rings(30, 70, 100, 16)}</>;
      break;
    case 1:
      art = (
        <>
          {Array.from({ length: 16 }, (_, i) => (
            <polygon key={i} points={`${i * 14 - 100},0 ${i * 14 - 86},0 ${i * 14 + 14},100 ${i * 14},100`} fill={fill(i)} />
          ))}
        </>
      );
      break;
    case 2:
      art = (
        <>
          {Array.from({ length: 36 }, (_, i) => (
            <circle key={i} cx={8 + (i % 6) * 17} cy={8 + Math.floor(i / 6) * 17} r={i % 2 ? 6 : 8} fill={fill(i + Math.floor(i / 6))} />
          ))}
        </>
      );
      break;
    case 3:
      art = (
        <>
          {Array.from({ length: 9 }, (_, i) => {
            const x = (i % 3) * 34;
            const y = Math.floor(i / 3) * 34;
            return (
              <g key={i}>
                <polygon points={`${x},${y} ${x + 34},${y} ${x},${y + 34}`} fill={LIGHT} />
                <polygon points={`${x + 34},${y + 34} ${x + 34},${y} ${x},${y + 34}`} fill={DARK} />
              </g>
            );
          })}
        </>
      );
      break;
    case 4:
      art = <>{rings(100, 0, 150, 25)}</>;
      break;
    default:
      art = (
        <>
          {Array.from({ length: 13 * 13 }, (_, n) => {
            const i = (n % 13) - 1;
            const j = Math.floor(n / 13) - 1;
            if ((i + j) % 2 !== 0) return null;
            const cx = i * 10;
            const cy = j * 10;
            return <polygon key={n} points={`${cx},${cy - 10} ${cx + 10},${cy} ${cx},${cy + 10} ${cx - 10},${cy}`} fill={fill((i + j) / 2 + j)} />;
          })}
        </>
      );
  }
  return (
    <svg className={css.pattern} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <g transform={`translate(${100 * (1 - size)},0) scale(${size})`}>
        <g transform={flip}>{art}</g>
      </g>
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

/** A poster address at another size: both cover CDNs (Apple, Deezer) serve any square size. */
export function posterAt(url: string, px: number): string {
  return url.replace(/\/(\d+)x\1(?=[-b])/, `/${px}x${px}`);
}

/**
 * A song's picture: its album poster when the catalog has one, otherwise the generated cover (colour and pattern from
 * the song, its initials on top). This replaces the YouTube video frame everywhere a song is shown, so a list never
 * mixes lyrics-on-video thumbnails with covers. Give it a `size` (px) or let the parent's width decide.
 */
export function SongArt({
  song,
  size,
  radius = "xs",
  shadow,
  explicit,
  className,
}: {
  song: Song;
  size?: number | string;
  radius?: "xs" | "sm" | "md" | "none";
  shadow?: boolean;
  /** Corner "E" for explicit songs: pass it where nothing next to the picture already shows the badge. */
  explicit?: boolean;
  className?: string;
}) {
  const t = useT();
  const hideCovers = useHideCovers();
  if (song.posterUrl && !hideCovers) {
    // Ask the CDN for about twice the display size on small pictures; bigger ones keep the 300px the catalog gave.
    const src = typeof size === "number" && size <= 150 ? posterAt(song.posterUrl, Math.max(100, size * 2)) : song.posterUrl;
    return <Artwork src={src} label={song.title} size={size} radius={radius} shadow={shadow} flat explicit={explicit} className={className} />;
  }
  const { title, artist } = songParts(song);
  const color = `var(--kt-tile-${((hash(`${title}|${artist}`) >>> 5) % 12) + 1})`;
  const initials = title.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span
      className={clsx(css.art, className)}
      style={{ width: size, height: size, background: color, borderRadius: radius === "none" ? 0 : `var(--kt-radius-${radius})`, boxShadow: shadow ? "var(--kt-shadow-card)" : undefined }}
      aria-hidden
    >
      <Pattern seed={song.videoId} />
      <span className={css.artInitials}>{initials}</span>
      {explicit && (
        <span className={css.tileE} title={t("song.explicit")} aria-label={t("song.explicit")} data-testid="explicit-mark">
          E
        </span>
      )}
    </span>
  );
}

/**
 * One song in a grid, always the same shape: a square cover with the title and artist under it. The cover is the song's
 * poster when it has one, otherwise the generated art, so posters and fallbacks sit side by side evenly.
 * The corner "E" marks explicit songs on either kind of cover (the text under it carries no badge).
 */
export function SongTile({ song, posterUrl, onClick, className }: { song: Song; posterUrl?: string | null; onClick?: () => void; className?: string }) {
  const { title, artist } = songParts(song);
  return (
    <button type="button" className={clsx(css.tile, className)} onClick={onClick} data-testid="song-tile">
      <SongArt song={posterUrl ? { ...song, posterUrl } : song} radius="md" shadow explicit={song.explicit} className={css.tileCover} />
      <span className={css.tileTitle}>{title}</span>
      <span className={css.tileArtist}>{artist}</span>
    </button>
  );
}
