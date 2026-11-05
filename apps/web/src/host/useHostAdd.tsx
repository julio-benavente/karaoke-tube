import { songParts, useAddFlow, useAddSong, useT, useToast } from "@karaoke-tube/ui";

/** Add a song as the host, with the "Added to queue · 3rd" toast. Asks who sings first (see AddFlow), then goes back to solo. */
export function useHostAdd() {
  const toast = useToast();
  const t = useT();
  const { add } = useAddSong(({ song, position }) => {
    const where = position === 0 ? t("add.hostNow") : position === 1 ? t("add.hostNext") : t("add.hostNth", { n: position });
    toast.show(
      <>
        {t("add.added")} <b>{songParts(song).title}</b> · {where}
      </>,
    );
  });
  return useAddFlow(add);
}
