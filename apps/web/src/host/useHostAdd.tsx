import { useCallback } from "react";
import type { Song } from "@karaoke-tube/shared";
import { songParts, useAddSong, useSingWith, useT, useToast } from "@karaoke-tube/ui";

/** Add a song as the host, with the "Added to queue · 3rd" toast. Sends the "Sing with…" choice, then goes back to solo. */
export function useHostAdd() {
  const toast = useToast();
  const t = useT();
  const sing = useSingWith();
  const { add } = useAddSong(({ song, position }) => {
    const where = position === 0 ? t("add.hostNow") : position === 1 ? t("add.hostNext") : t("add.hostNth", { n: position });
    toast.show(
      <>
        {t("add.added")} <b>{songParts(song).title}</b> · {where}
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
