import { useCallback, useRef, useState } from "react";

/** "Ver aquí" (the karaoke video on a phone) is switched off for now. Set to true to bring the button and the video back. */
export const WATCH_HERE: boolean = false;

const KEY = "kt:watch";
/** A second tap this soon after a change is a double tap (the button moves and turns into "hide"): ignore it. */
const LOCKOUT_MS = 800;

/** Whether this device shows the karaoke video itself ("Watch here"). Remembered per device. */
export function useWatchPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const last = useRef(0);
  const set = useCallback((v: boolean) => {
    const now = Date.now();
    if (now - last.current < LOCKOUT_MS) return;
    last.current = now;
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }, []);
  return [on, set];
}
