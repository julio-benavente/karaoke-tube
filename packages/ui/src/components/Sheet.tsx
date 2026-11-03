import clsx from "clsx";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import css from "./Sheet.module.css";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible title. */
  label: string;
  /** "full" covers the screen (now singing); "auto" fits content (menus). */
  size?: "auto" | "full";
  /** Background of the sheet (e.g. a song tint gradient). */
  style?: CSSProperties;
  className?: string;
};

const EXIT_MS = 300;

/** Bottom sheet with backdrop, slide-up, Escape and swipe-down to close. */
export function Sheet({ open, onClose, children, label, size = "auto", style, className }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const onPointerDown = (e: PointerEvent) => {
    // Swipe from the handle area or when content is scrolled to the top.
    const scroller = panel.current;
    if (scroller && scroller.scrollTop > 0) return;
    startY.current = e.clientY;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (startY.current === null) return;
    setDrag(Math.max(0, e.clientY - startY.current));
  };
  const onPointerUp = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (drag > 120) onClose();
    setDrag(0);
  };

  return createPortal(
    <div className={clsx(css.root, shown && css.shown)}>
      <div className={css.backdrop} onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={clsx(css.panel, css[size], className)}
        style={{ ...style, transform: shown && drag ? `translateY(${drag}px)` : undefined, transition: drag ? "none" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {size === "auto" && <div className={css.handle} aria-hidden />}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** A list of actions inside a sheet or menu. */
export function ActionList({
  items,
}: {
  items: Array<{ key: string; label: string; icon?: ReactNode; onClick: () => void; danger?: boolean }>;
}) {
  return (
    <ul className={css.actions}>
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" className={clsx(css.action, it.danger && css.danger)} onClick={it.onClick}>
            {it.icon}
            <span>{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
