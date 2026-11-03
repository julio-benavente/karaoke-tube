import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import css from "./Misc.module.css";

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx(css.empty, className)}>
      {icon && <div className={css.emptyIcon}>{icon}</div>}
      <h2 className={css.emptyTitle}>{title}</h2>
      {children && <p className={css.emptyText}>{children}</p>}
      {action && <div className={css.emptyAction}>{action}</div>}
    </div>
  );
}

/** The Karaoke Tube mark: a mic in a circle (placeholder). */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} role="img" aria-label="Karaoke Tube">
      <circle cx="16" cy="16" r="16" fill="var(--kt-accent)" />
      <rect x="12.5" y="6.5" width="7" height="12" rx="3.5" fill="var(--kt-accent-ink)" />
      <path
        d="M9.5 15.5a6.5 6.5 0 0 0 13 0M16 22v4M12.5 26h7"
        fill="none"
        stroke="var(--kt-accent-ink)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark + "Karaoke Tube" wordmark. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx(css.logo, className)} style={{ fontSize: size * 0.62 }}>
      <Mark size={size} />
      <span>Karaoke Tube</span>
    </span>
  );
}

export function Spinner({ size = 28, className }: { size?: number; className?: string }) {
  return <span className={clsx(css.spinner, className)} style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

/** Text input with the Spotify-like filled style. */
export function TextField({
  label,
  hideLabel,
  error,
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hideLabel?: boolean; error?: string | null; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className={clsx(css.field, className)}>
      <span className={clsx(css.fieldLabel, hideLabel && "kt-sr-only")}>{label}</span>
      <input {...rest} ref={ref} className={clsx(css.input, error && css.inputError)} aria-invalid={!!error || undefined} />
      {error && <span className={css.fieldError}>{error}</span>}
    </label>
  );
}

/** Banner at the top of the screen (reconnecting, your turn…). */
export function Banner({
  tone = "info",
  icon,
  children,
  action,
}: {
  tone?: "info" | "accent" | "warning";
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={clsx(css.banner, css[`b_${tone}`])} role={tone === "warning" ? "alert" : undefined}>
      {icon}
      <span className={css.bannerText}>{children}</span>
      {action}
    </div>
  );
}
