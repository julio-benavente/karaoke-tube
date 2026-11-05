import { useCallback, type ReactNode } from "react";
import { useRoom } from "../hooks/room";
import { SessionLanguage } from "./context";
import type { Lang } from "./core";

/**
 * Inside a RoomProvider: everything below speaks the session's language (`state.settings.language`), whatever the
 * device prefers. Until the first state arrives the device's language is used. In here the language switcher
 * changes the session's language (hosts only; the room refuses it from anyone else).
 */
export function RoomLanguage({ children }: { children: ReactNode }) {
  const { state, send } = useRoom();
  const change = useCallback((language: Lang) => send({ type: "update_settings", settings: { language } }), [send]);
  return <SessionLanguage lang={state?.settings.language ?? undefined} onChange={change}>{children}</SessionLanguage>;
}
