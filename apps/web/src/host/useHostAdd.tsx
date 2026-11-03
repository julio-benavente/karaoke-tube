import { useCallback } from "react";
import type { Song } from "@karaoke-tube/shared";
import { ordinal, songParts, useAddSong, useSingWith, useToast } from "@karaoke-tube/ui";

/** Add a song as the host, with the "Added to queue · 3rd" toast. Sends the "Sing with…" choice, then goes back to solo. */
export function useHostAdd() {
  const toast = useToast();
  const sing = useSingWith();
  const { add } = useAddSong(({ song, position }) => {
    const where = position === 0 ? "playing now" : position === 1 ? "up next" : `${ordinal(position)} in line`;
    toast.show(
      <>
        Added <b>{songParts(song).title}</b> · {where}
      </>,
    );
  });
  return useCallback(
    (song: Song) => {
      add(song, sing.singers());
      sing.reset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [add, sing.everyone, sing.partnerIds.join(",")],
  );
}
