import clsx from "clsx";
import { avatarUri } from "../avatar";
import css from "./Avatar.module.css";

export type AvatarProps = {
  seed: string;
  /** Pixel size. Default 32. */
  size?: number;
  /** Accessible name; omit for decorative avatars. */
  name?: string;
  /** Show a dot: green-free "online" uses the accent; false shows a grey dot. */
  online?: boolean;
  ring?: boolean;
  className?: string;
};

export function Avatar({ seed, size = 32, name, online, ring, className }: AvatarProps) {
  return (
    <span className={clsx(css.root, ring && css.ring, className)} style={{ width: size, height: size }}>
      <img src={avatarUri(seed)} alt={name ?? ""} width={size} height={size} className={css.img} draggable={false} />
      {online !== undefined && <span className={clsx(css.dot, online ? css.on : css.off)} aria-hidden />}
    </span>
  );
}

/** Overlapping avatars, e.g. duet singers or "who's here". */
export function AvatarStack({ seeds, size = 24, max = 4 }: { seeds: string[]; size?: number; max?: number }) {
  const shown = seeds.slice(0, max);
  const rest = seeds.length - shown.length;
  return (
    <span className={css.stack}>
      {shown.map((s, i) => (
        <Avatar key={s + i} seed={s} size={size} className={css.stacked} />
      ))}
      {rest > 0 && (
        <span className={css.more} style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </span>
  );
}
