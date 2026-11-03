import { useCallback, useState } from "react";

const KEY = "kt:watch";

/** Whether this device shows the karaoke video itself ("Watch here"). Remembered per device. */
export function useWatchPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = useCallback((v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }, []);
  return [on, set];
}
