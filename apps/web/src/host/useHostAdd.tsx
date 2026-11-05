import { songParts, useAddFlow, useAddSong, useT, useToast } from "@karaoke-tube/ui";

/**
 * Add a song as the host, with the "Added to queue · 3rd" toast. The "add a song for Ana" / "Sing with…" choice applies
 * to this one song only (the choice is read fresh when sending, then goes back to "just me"). With no choice made, the
 * AddFlow sheet asks who sings (a partner is optional: skip).
 */
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
