import clsx from "clsx";
import type { ReactNode } from "react";
import css from "./BottomTabs.module.css";

export type Tab = { key: string; label: string; icon: ReactNode; activeIcon?: ReactNode; badge?: number };

/** Phone bottom tabs over a dark gradient. The router stays in the app: pass `active` and `onSelect`. */
export function BottomTabs({
  tabs,
  active,
  onSelect,
  children,
}: {
  tabs: Tab[];
  active: string;
  onSelect: (key: string) => void;
  /** Rendered above the tabs, e.g. the MiniPlayer. */
  children?: ReactNode;
}) {
  return (
    <div className={css.dock}>
      {children}
      <nav className={css.tabs} aria-label="Main">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              className={clsx(css.tab, on && css.on)}
              aria-current={on ? "page" : undefined}
              onClick={() => onSelect(t.key)}
            >
              <span className={css.icon}>
                {on && t.activeIcon ? t.activeIcon : t.icon}
                {!!t.badge && <span className={css.badge}>{t.badge}</span>}
              </span>
              <span className={css.label}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
