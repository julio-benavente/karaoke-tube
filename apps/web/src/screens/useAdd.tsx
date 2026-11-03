import { useCallback } from "react";
import type { Song } from "@karaoke-tube/shared";
import { ordinal, songParts, useAddSong, useSingWith, useToast } from "@karaoke-tube/ui";

/** useAddSong + the "Added to queue · you're 3rd" toast. Sends the "Sing with…" choice, then goes back to solo. */
export function useAddWithToast() {
  const toast = useToast();
  const sing = useSingWith();
  const { add, pending } = useAddSong(({ song, position, awaitingApproval }) => {
    const { title } = songParts(song);
    if (awaitingApproval) {
      toast.show(
        <>
          <b>{title}</b> · waiting for the host's OK
        </>,
      );
      return;
    }
    const where = position === 0 ? "you're up now!" : position === 1 ? "you're next" : `you're ${ordinal(position)}`;
    toast.show(
      <>
        Added <b>{title}</b> · {where}
      </>,
    );
  });
  const addWithSingers = useCallback(
    (song: Song) => {
      add(song, sing.singers());
      sing.reset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [add, sing.everyone, sing.partnerIds.join(",")],
  );
  return { add: addWithSingers, pending };
}
