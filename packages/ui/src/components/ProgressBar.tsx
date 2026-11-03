import clsx from "clsx";
import { formatTime } from "../format";
import css from "./ProgressBar.module.css";

export type ProgressBarProps = {
  value: number;
  max: number;
  /** Show elapsed / total times on either side. */
  showTimes?: boolean;
  /** "thin" = 2 px line for the mini player. */
  variant?: "default" | "thin";
  className?: string;
  label?: string;
};

/** Spotify-style progress: thin track, white fill that turns pink with a knob on hover. Read-only. */
export function ProgressBar({ value, max, showTimes, variant = "default", className, label = "Song progress" }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bar = (
    <div
      className={clsx(css.track, variant === "thin" && css.thin)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${formatTime(value)} of ${formatTime(max)}`}
    >
      <div className={css.fill} style={{ width: `${pct}%` }} />
      {variant !== "thin" && <div className={css.knob} style={{ left: `${pct}%` }} />}
    </div>
  );
  if (!showTimes) return <div className={clsx(css.solo, className)}>{bar}</div>;
  return (
    <div className={clsx(css.withTimes, className)}>
      <span className={css.time}>{formatTime(value)}</span>
      {bar}
      <span className={css.time}>{formatTime(max)}</span>
    </div>
  );
}
