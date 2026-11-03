import { useCallback } from "react";
import type { Song } from "@karaoke-tube/shared";
import { songParts, useAddSong, useSingWith, useT, useToast } from "@karaoke-tube/ui";

/** useAddSong + the "Added to queue · you're 3rd" toast. Sends the "Sing with…" choice, then goes back to solo. */
export function useAddWithToast() {
  const toast = useToast();
  const t = useT();
  const sing = useSingWith();
  const { add, pending } = useAddSong(({ song, position, awaitingApproval }) => {
    const { title } = songParts(song);
    if (awaitingApproval) {
      toast.show(
        <>
          <b>{title}</b> · {t("add.waiting")}
        </>,
      );
      return;
    }
    const where = position === 0 ? t("add.upNow") : position === 1 ? t("add.next") : t("add.nth", { n: position });
    toast.show(
      <>
        {t("add.added")} <b>{title}</b> · {where}
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
