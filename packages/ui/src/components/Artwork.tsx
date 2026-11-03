import clsx from "clsx";
import { Mic } from "lucide-react";
import { useState } from "react";
import css from "./Artwork.module.css";

/**
 * A stable hue for any string, for fallbacks and tinted backgrounds.
 * Greens (80–170) are skipped so nothing reads as the other app's brand colour.
 */
export function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const hue = h % 270; // 270 usable degrees
  return hue < 80 ? hue : hue + 90;
}

/** Dark tint for a song, used like Spotify's artwork colour (mini player, now-playing gradient). */
export function tintOf(key: string, lightness = 26): string {
  return `hsl(${hueOf(key)} 42% ${lightness}%)`;
}

export type ArtworkProps = {
  src?: string;
  /** Used for the fallback colour and alt text. */
  label: string;
  size?: number | string;
  /** Square crop (default) or the video's 16:9. */
  shape?: "square" | "wide" | "round";
  radius?: "xs" | "sm" | "md" | "none";
  shadow?: boolean;
  className?: string;
};

/** Song artwork from a YouTube thumbnail, cropped square; gradient + mic when it fails. */
export function Artwork({ src, label, size, shape = "square", radius = "xs", shadow, className }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const hue = hueOf(label);
  const hue2 = (hue + (hue < 80 ? 330 : 30)) % 360; // second stop, also never green
  return (
    <span
      className={clsx(css.root, css[shape], css[`r_${radius}`], shadow && css.shadow, className)}
      style={{
        width: size,
        height: shape === "wide" ? undefined : size,
        background: `linear-gradient(135deg, hsl(${hue} 55% 38%), hsl(${hue2} 60% 22%))`,
      }}
    >
      {src && !failed ? (
        <img src={src} alt="" className={css.img} loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <Mic className={css.icon} aria-hidden />
      )}
    </span>
  );
}
