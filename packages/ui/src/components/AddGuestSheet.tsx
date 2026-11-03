import { useEffect, useState } from "react";
import { randomSeed } from "../avatar";
import { useRoom } from "../hooks/room";
import { AvatarPicker } from "./AvatarPicker";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { TextField } from "./EmptyState";
import css from "./AddGuestSheet.module.css";

/** Hosts: add a guest who has no phone. They join the rotation; a host then adds songs for them ("Who sings?"). */
export function AddGuestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { send } = useRoom();
  const [name, setName] = useState("");
  const [seed, setSeed] = useState(randomSeed);
  useEffect(() => {
    if (open) {
      setName("");
      setSeed(randomSeed());
    }
  }, [open]);
  const ok = name.trim().length > 0;
  const submit = () => {
    if (!ok) return;
    send({ type: "add_guest", nickname: name.trim(), avatarSeed: seed });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label="Add a guest without a phone">
      <form
        className={css.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className={css.title}>Add a guest without a phone</h2>
        <p className={css.text}>They get turns like everyone else. Add songs for them from Search with "Who sings?".</p>
        <AvatarPicker value={seed} onChange={setSeed} compact />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus placeholder="Grandma, Uncle Tom…" />
        <Button type="submit" block disabled={!ok}>
          Add guest
        </Button>
      </form>
    </Sheet>
  );
}
