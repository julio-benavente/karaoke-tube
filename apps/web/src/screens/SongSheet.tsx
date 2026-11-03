import { CirclePlus } from "lucide-react";
import type { Song } from "@karaoke-tube/shared";
import { ActionList, Artwork, Sheet, formatTime, songParts } from "@karaoke-tube/ui";
import css from "./SongSheet.module.css";

/** Song details + "Add to queue", opened from Home tiles and cards. */
export function SongSheet({ song, onClose, onAdd }: { song: Song | null; onClose: () => void; onAdd: (s: Song) => void }) {
  const parts = song ? songParts(song) : null;
  return (
    <Sheet open={!!song} onClose={onClose} label={parts ? `${parts.title} options` : "Song"}>
      {song && parts && (
        <>
          <div className={css.head}>
            <Artwork src={song.thumbnailUrl} label={song.title} size={56} />
            <div className={css.text}>
              <div className={css.title}>{parts.title}</div>
              <div className={css.sub}>
                {parts.artist} · {formatTime(song.durationSec)}
              </div>
            </div>
          </div>
          <ActionList
            items={[
              {
                key: "add",
                label: "Add to queue",
                icon: <CirclePlus />,
                onClick: () => {
                  onAdd(song);
                  onClose();
                },
              },
            ]}
          />
        </>
      )}
    </Sheet>
  );
}
