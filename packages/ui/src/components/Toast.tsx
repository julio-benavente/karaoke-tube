import clsx from "clsx";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import css from "./Toast.module.css";

export type ToastOptions = {
  /** Default 3000 ms. */
  duration?: number;
  tone?: "default" | "error";
  action?: { label: string; onClick: () => void };
};

type ToastItem = ToastOptions & { id: number; message: ReactNode; leaving?: boolean };
type ToastApi = { show: (message: ReactNode, options?: ToastOptions) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Renders toasts above the bottom chrome. `offset` = px from the bottom (to clear tabs or player bar). */
export function ToastProvider({ children, offset = 24 }: { children: ReactNode; offset?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const after = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const show = useCallback((message: ReactNode, options: ToastOptions = {}) => {
    const id = seq.current++;
    // One toast at a time, like Spotify: the new one replaces the old.
    setItems([{ id, message, ...options }]);
    after(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), options.duration ?? 3000);
    after(() => setItems((xs) => xs.filter((x) => x.id !== id)), (options.duration ?? 3000) + 250);
  }, []);

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={css.region} style={{ bottom: offset }} role="status" aria-live="polite">
        {items.map((t) => (
          <Toast key={t.id} tone={t.tone} leaving={t.leaving} action={t.action}>
            {t.message}
          </Toast>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** A single toast (presentational). */
export function Toast({
  children,
  tone = "default",
  leaving,
  action,
}: {
  children: ReactNode;
  tone?: "default" | "error";
  leaving?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={clsx(css.toast, tone === "error" && css.error, leaving && css.leaving)}>
      <span className={css.msg}>{children}</span>
      {action && (
        <button type="button" className={css.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
