import { useEffect } from "react";

type WakeLockSentinel = { release(): Promise<void> };
type WakeLockApi = { request(type: "screen"): Promise<WakeLockSentinel> };

/**
 * Keeps the screen awake while `active` (a phone or tablet used as the TV would otherwise dim and sleep mid-song, which
 * also ends a screen-mirror). Browsers drop the lock when the tab is hidden, so it is asked for again on return.
 * Silently does nothing where the Screen Wake Lock API doesn't exist.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !api) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      api
        .request("screen")
        .then((l) => {
          if (alive) lock = l;
          else void l.release().catch(() => {});
        })
        .catch(() => {}); // battery saver, no permission…: not worth a message
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
