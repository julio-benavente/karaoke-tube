import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import css from "./Chip.module.css";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: ReactNode;
};

/** Filter chip ("All", "Pop", "80s"…). Selected = pink. */
export function Chip({ selected, icon, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={clsx(css.chip, selected && css.selected, className)}
    >
      {icon}
      {children}
    </button>
  );
}

/** Static label, e.g. "Host", "You", "Locked". */
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "accent" | "warning";
  className?: string;
  children: ReactNode;
}) {
  return <span className={clsx(css.pill, css[tone], className)}>{children}</span>;
}

export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx(css.row, className)}>{children}</div>;
}
