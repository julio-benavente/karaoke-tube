import { ordinal, songParts, useAddSong, useToast } from "@karaoke-tube/ui";

/** Add a song as the host, with the "Added to queue · 3rd" toast. */
export function useHostAdd() {
  const toast = useToast();
  const { add } = useAddSong(({ song, position }) => {
    const where = position === 0 ? "playing now" : position === 1 ? "up next" : `${ordinal(position)} in line`;
    toast.show(
      <>
        Added <b>{songParts(song).title}</b> · {where}
      </>,
    );
  });
  return add;
}
