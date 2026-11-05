import { CirclePlus, Heart } from "lucide-react";
import type { Song } from "@karaoke-tube/shared";
import { ActionList, Artwork, Sheet, SingWithPicker, formatTime, songParts, useSingWith, useT } from "@karaoke-tube/ui";
import { useFavorites } from "../account/AccountContext";
import css from "./SongSheet.module.css";

/** Song details + "Add to queue", opened from Home tiles and cards. */
export function SongSheet({ song, onClose, onAdd }: { song: Song | null; onClose: () => void; onAdd: (s: Song) => void }) {
  const parts = song ? songParts(song) : null;
  const sing = useSingWith();
  const t = useT();
  const fav = useFavorites();
  const isFav = !!song && fav.ids.has(song.videoId);
  return (
    <Sheet open={!!song} onClose={onClose} label={parts ? t("song.sheetTitle", { title: parts.title }) : t("song.sheet")}>
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
          {sing.enabled && (
            <div className={css.sing}>
              <div className={css.singTitle}>{song.duet ? t("song.duetHint") : t("singwith.title")}</div>
              <SingWithPicker />
            </div>
          )}
          <ActionList
            items={[
              {
                key: "add",
                label: t("home.add"),
                icon: <CirclePlus />,
                onClick: () => {
                  onAdd(song);
                  onClose();
                },
              },
              // Favorites are an account feature: guests don't see the row.
              ...(fav.signedIn
                ? [
                    {
                      key: "fav",
                      label: isFav ? t("acct.favorites.remove") : t("acct.favorites.add"),
                      icon: <Heart fill={isFav ? "currentColor" : "none"} />,
                      onClick: () => void fav.toggle(song),
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </Sheet>
  );
}
