import { useRef, type ReactNode } from "react";

/**
 * Phones only open the keyboard when a field is focused during the tap itself, but opening Search happens a moment later.
 * So the tap focuses this invisible input first (`prime()`, called before navigating); the Search field then takes the focus
 * over and the keyboard stays up. Render `proxy` once on the page that has the search bar.
 */
export function useSearchPrime(): { proxy: ReactNode; prime: () => void } {
  const ref = useRef<HTMLInputElement>(null);
  const proxy = (
    <input
      ref={ref}
      aria-hidden
      tabIndex={-1}
      inputMode="search"
      autoComplete="off"
      style={{ position: "fixed", top: 0, left: 0, width: 1, height: 1, padding: 0, border: 0, opacity: 0, fontSize: 16, pointerEvents: "none" }}
    />
  );
  return { proxy, prime: () => ref.current?.focus({ preventScroll: true }) };
}
