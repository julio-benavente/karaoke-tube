import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useT } from "../i18n/context";
import css from "./Button.module.css";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "light";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  block?: boolean;
};

/** Pill button. Primary = pink, secondary = outlined, light = white. */
export function Button({ variant = "primary", size = "md", icon, block, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(css.btn, css[variant], css[size], block && css.block, className)}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "plain" | "filled" | "accent" | "light";
  active?: boolean;
};

/** Round icon-only button. `label` is required for accessibility. */
export function IconButton({ label, size = "md", variant = "plain", active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={clsx(css.icon, css[`i_${size}`], css[`i_${variant}`], active && css.active, className)}
    >
      {children}
    </button>
  );
}

/** The big round play/pause button. */
export function PlayButton({
  playing,
  onClick,
  size = 48,
  label,
  className,
}: {
  playing: boolean;
  onClick?: () => void;
  size?: number;
  label?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={clsx(css.play, className)}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={label ?? (playing ? t("player.pause") : t("player.play"))}
      title={label ?? (playing ? t("player.pause") : t("player.play"))}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" width={size * 0.42} height={size * 0.42} fill="currentColor" aria-hidden>
          <rect x="5" y="3" width="5" height="18" rx="1.2" />
          <rect x="14" y="3" width="5" height="18" rx="1.2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.42} height={size * 0.42} fill="currentColor" aria-hidden>
          <path d="M7 3.8v16.4a1 1 0 0 0 1.52.85l13.2-8.2a1 1 0 0 0 0-1.7L8.52 2.95A1 1 0 0 0 7 3.8Z" />
        </svg>
      )}
    </button>
  );
}
