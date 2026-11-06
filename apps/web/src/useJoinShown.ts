import { useEffect, useState } from "react";
import { serverNow } from "@karaoke-tube/shared";

/** True while a host's "Show code on TV" is on (`RoomState.joinShownUntil`); flips back to false by itself when the time is up. */
export function useJoinShown(until: number | null | undefined): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const left = until - serverNow();
    if (left <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), left + 50);
    return () => clearTimeout(id);
  }, [until]);
  return !!until && serverNow() < until;
}
