import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState } from "@karaoke-tube/shared";
import { useT } from "../i18n";
import type { TFn } from "../i18n";
import { useRoom } from "./room";

export type TurnAlert = {
  /** Changes whenever there is a new thing to tell the member (song + stage). */
  key: string;
  stage: "soon" | "next" | "now";
  message: string;
};

/**
 * "You're up in 2 songs" → "You're up next!" → "Get ready, you're up!", computed from the room state.
 * Null when nothing to say or when the host turned turn alerts off.
 */
export function turnAlertFor(state: RoomState | null | undefined, meId: string | null | undefined, t: TFn): TurnAlert | null {
  if (!state || !meId || !state.settings.turnAlerts) return null;
  return ownTurnAlert(state, meId, t) ?? phonelessTurnAlert(state, meId, t);
}

/** Hosts hear about the turns of guests who have no phone, so they can call them over to the mic. */
function phonelessTurnAlert(state: RoomState, meId: string, t: TFn): TurnAlert | null {
  const me = state.members.find((m) => m.id === meId);
  if (!me || (me.role !== "host" && me.role !== "cohost")) return null;
  const { nowPlaying, upNext, playback } = state;
  const names = (ids: string[]) => {
    const list = state.members.filter((m) => m.phoneless && ids.includes(m.id)).map((m) => m.nickname);
    return list.length ? list.join(" & ") : null;
  };
  if (nowPlaying && playback.state === "get_ready") {
    const who = names(nowPlaying.singerIds);
    if (who) return { key: `${nowPlaying.id}:pnow`, stage: "now", message: t("turn.phonelessNow", { who }) };
  }
  const next = upNext[0];
  const who = next && names(next.singerIds);
  if (next && who) return { key: `${next.id}:pnext`, stage: "next", message: t("turn.phonelessNext", { who }) };
  return null;
}

function ownTurnAlert(state: RoomState, meId: string, t: TFn): TurnAlert | null {
  const { nowPlaying, upNext, playback } = state;
  if (nowPlaying?.singerIds.includes(meId)) {
    return playback.state === "get_ready"
      ? { key: `${nowPlaying.id}:now`, stage: "now", message: t("queue.banner.getReady") }
      : null;
  }
  const idx = upNext.findIndex((q) => q.singerIds.includes(meId));
  if (idx < 0) return null;
  const item = upNext[idx]!;
  if (idx === 0) return { key: `${item.id}:next`, stage: "next", message: t("queue.banner.next") };
  const songsAway = idx + (nowPlaying ? 1 : 0);
  if (songsAway === 2) return { key: `${item.id}:soon`, stage: "soon", message: t("queue.banner.soon", { count: 2 }) };
  return null;
}

const SHOW_MS = 10_000;

/** The turn alert to show right now (hides after a few seconds or when dismissed) and vibrates on a new one. */
export function useTurnAlert(): { alert: TurnAlert | null; dismiss: () => void } {
  const { state, me } = useRoom();
  const t = useT();
  const current = turnAlertFor(state, me?.id, t);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const lastKey = useRef<string | null | undefined>(undefined);
  const key = current?.key ?? null;

  useEffect(() => {
    if (!key) return;
    // Don't buzz for an alert that was already true when the page opened.
    if (lastKey.current !== undefined && lastKey.current !== key) {
      try {
        navigator.vibrate?.(current?.stage === "soon" ? [120] : [220, 90, 220]);
      } catch {
        // vibration blocked
      }
    }
    const timer = setTimeout(() => setHidden((s) => new Set(s).add(key)), SHOW_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    lastKey.current = key;
  }, [key]);

  const dismiss = useCallback(() => {
    if (key) setHidden((s) => new Set(s).add(key));
  }, [key]);

  return { alert: current && !hidden.has(current.key) ? current : null, dismiss };
}
