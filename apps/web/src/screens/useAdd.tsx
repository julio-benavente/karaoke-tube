import { ordinal, songParts, useAddSong, useToast } from "@karaoke-tube/ui";

/** useAddSong + the "Added to queue · you're 3rd" toast. */
export function useAddWithToast() {
  const toast = useToast();
  return useAddSong(({ song, position }) => {
    const { title } = songParts(song);
    const where = position === 0 ? "you're up now!" : position === 1 ? "you're next" : `you're ${ordinal(position)}`;
    toast.show(
      <>
        Added <b>{title}</b> · {where}
      </>,
    );
  });
}
