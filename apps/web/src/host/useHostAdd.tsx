import { useCallback, useRef } from "react";
import type { Song } from "@karaoke-tube/shared";
import { songParts, useAddSong, useSingWith, useT, useToast } from "@karaoke-tube/ui";

/**
 * Add a song as the host, with the "Added to queue · 3rd" toast. The "Sing with…" / "add a song for Ana" choice
 * applies to this one song only: right after it is sent, the choice goes back to "just me".
 */
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
  // Always read the choice as it is now. A memoized callback kept an old copy of it (the "for Ana" choice was not
  // in its dependencies), so the reset below could not be trusted to line up with what was sent.
  const latest = useRef(sing);
  latest.current = sing;
  return useCallback(
    (song: Song) => {
      const choice = latest.current;
      add(song, choice.singers());
      choice.reset();
    },
    [add],
  );
}
