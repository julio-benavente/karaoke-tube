import { useEffect, useState } from "react";
import { useRoom } from "../hooks/room";
import { useT } from "../i18n";
import { AvatarPicker } from "./AvatarPicker";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import css from "./AddGuestSheet.module.css";

/** Anyone in the room changes their own avatar. The room tells everyone (host app, TV, queue) at once. */
export function ChangeAvatarSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: (seed: string) => void }) {
  const { me, send } = useRoom();
  const t = useT();
  const [seed, setSeed] = useState(me?.avatarSeed ?? "");
  useEffect(() => {
    if (open && me) setSeed(me.avatarSeed);
    // Only when the sheet opens; later avatar changes of `me` shouldn't reset the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!me) return null;
  const save = () => {
    if (seed && seed !== me.avatarSeed) {
      send({ type: "update_avatar", avatarSeed: seed });
      onChanged?.(seed);
    }
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={t("avatar.change")}>
      <div className={css.form}>
        <h2 className={css.title}>{t("avatar.change")}</h2>
        <AvatarPicker value={seed} onChange={setSeed} compact />
        <Button block onClick={save} data-testid="avatar-save">
          {t("avatar.save")}
        </Button>
      </div>
    </Sheet>
  );
}
