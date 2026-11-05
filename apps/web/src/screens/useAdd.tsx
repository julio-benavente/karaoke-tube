import { useCallback } from "react";
import type { Song } from "@karaoke-tube/shared";
import { songParts, useAddFlow, useAddSong, useSingWith, useT, useToast } from "@karaoke-tube/ui";

/**
 * useAddSong + the "Added to queue · you're 3rd" toast. `add` asks who sings first (AddFlow: Home, Search, everywhere);
 * `addNow` skips the question, for screens that already show the "Sing with…" picker (the song sheet).
 */
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
  const addAsking = useAddFlow(add);
  return { add: addAsking, addNow: addWithSingers, pending };
}
