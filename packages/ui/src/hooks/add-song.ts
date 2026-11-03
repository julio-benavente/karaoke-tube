import { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "@karaoke-tube/shared";
import { useRoomClient } from "./room";

export type AddResult = {
  song: Song;
  /** 0 = playing now (queue was empty), 1 = next, 2 = after one song… */
  position: number;
};

type Pending = { song: Song; knownIds: Set<string>; timer: ReturnType<typeof setTimeout> };

/**
 * Sends `add_song` and reports where the new item landed once the room's state includes it.
 * Errors (queue limit, not allowed) clear the pending flag; show them with useRoomErrors.
 */
export function useAddSong(onAdded?: (r: AddResult) => void) {
  const client = useRoomClient();
  const [pending, setPending] = useState<string[]>([]);
  const waiting = useRef(new Map<string, Pending>());
  const cb = useRef(onAdded);
  cb.current = onAdded;

  const clear = useCallback((videoId: string) => {
    const p = waiting.current.get(videoId);
    if (p) clearTimeout(p.timer);
    waiting.current.delete(videoId);
    setPending((xs) => xs.filter((x) => x !== videoId));
  }, []);

  useEffect(() => {
    const check = () => {
      const st = client.state;
      const me = client.me;
      if (!st || !me) return;
      for (const [videoId, p] of waiting.current) {
        const isNew = (id: string) => !p.knownIds.has(id);
        const idx = st.upNext.findIndex((q) => q.song.videoId === videoId && q.addedBy === me.id && isNew(q.id));
        const now = st.nowPlaying;
        const playingNow = !!now && now.song.videoId === videoId && now.addedBy === me.id && isNew(now.id);
        if (idx >= 0 || playingNow) {
          clear(videoId);
          cb.current?.({ song: p.song, position: playingNow ? 0 : idx + 1 });
        }
      }
    };
    const offState = client.subscribe(check);
    const offError = client.onError((e) => {
      if (e.code === "queue_limit" || e.code === "not_allowed") for (const id of [...waiting.current.keys()]) clear(id);
    });
    return () => {
      offState();
      offError();
    };
  }, [client, clear]);

  const add = useCallback(
    (song: Song) => {
      if (waiting.current.has(song.videoId)) return;
      const st = client.state;
      const knownIds = new Set([...(st?.upNext.map((q) => q.id) ?? []), ...(st?.nowPlaying ? [st.nowPlaying.id] : [])]);
      const timer = setTimeout(() => clear(song.videoId), 8000);
      waiting.current.set(song.videoId, { song, knownIds, timer });
      setPending((xs) => [...xs, song.videoId]);
      client.send({ type: "add_song", song });
    },
    [client, clear],
  );

  return { add, pending };
}
