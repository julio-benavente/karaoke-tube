import { X } from "lucide-react";
import { Avatar, useRoom, useSingWith, useT } from "@karaoke-tube/ui";
import css from "./host.module.css";

/** Host adding a song on someone's behalf: says who the next song is for, with a way to cancel. One song only. */
export function NextSongFor() {
  const { state } = useRoom();
  const sing = useSingWith();
  const t = useT();
  const member = sing.asId ? state?.members.find((m) => m.id === sing.asId) : undefined;
  if (!member) return null;
  return (
    <div className={css.nextFor} role="status" data-testid="next-song-for">
      <Avatar seed={member.avatarSeed} size={28} />
      <span className={css.nextForText}>{t("host.nextFor", { name: member.nickname })}</span>
      <button type="button" className={css.nextForCancel} onClick={sing.reset} aria-label={t("host.nextForCancel")}>
        <X size={16} />
        {t("host.nextForCancel")}
      </button>
    </div>
  );
}
