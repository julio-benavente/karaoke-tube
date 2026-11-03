import clsx from "clsx";
import type { ReactNode } from "react";
import { useT } from "../i18n/context";
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
  const t = useT();
  return (
    <div className={css.dock}>
      {children}
      <nav className={css.tabs} aria-label={t("nav.main")}>
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              className={clsx(css.tab, on && css.on)}
              aria-current={on ? "page" : undefined}
              onClick={() => onSelect(tab.key)}
            >
              <span className={css.icon}>
                {on && tab.activeIcon ? tab.activeIcon : tab.icon}
                {!!tab.badge && <span className={css.badge}>{tab.badge}</span>}
              </span>
              <span className={css.label}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
