import { Check, PartyPopper, Phone, User, Users } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AddSingers } from "../hooks/add-song";
import { useRoom } from "../hooks/room";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import css from "./SingWith.module.css";

type Choice = { partnerIds: string[]; everyone: boolean; /** Hosts: sing as (add songs for) this member instead of yourself. */ asId?: string | null };
type Ctx = { choice: Choice; setChoice: (c: Choice) => void };
const SingWithContext = createContext<Ctx | null>(null);

/** Remembers who sings the next song you add ("Sing with…"). Wrap the app inside RoomProvider. */
export function SingWithProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Choice>({ partnerIds: [], everyone: false });
  const value = useMemo(() => ({ choice, setChoice }), [choice]);
  return <SingWithContext.Provider value={value}>{children}</SingWithContext.Provider>;
}

export type UseSingWith = {
  /** False when the host turned duets off or nobody else is here: hide the duet part of the picker. */
  enabled: boolean;
  /** Hosts and co-hosts can add songs on behalf of someone else (a guest without a phone, a shy friend). */
  canAddFor: boolean;
  /** The member the next song is for, when a host is adding for someone else. Null = yourself. */
  asId: string | null;
  setAs: (id: string | null) => void;
  everyone: boolean;
  /** Partner ids that are still in the party. */
  partnerIds: string[];
  toggleMember: (id: string) => void;
  setEveryone: (on: boolean) => void;
  solo: () => void;
  /** The singers to send with `add`, or undefined for a solo song. */
  singers: () => AddSingers | undefined;
  /** Back to solo (after a song is added). */
  reset: () => void;
  /** "Just me", "With Ana", "With Ana & Ben", "Everyone sings". */
  label: string;
};

export function useSingWith(): UseSingWith {
  const ctx = useContext(SingWithContext);
  if (!ctx) throw new Error("useSingWith needs <SingWithProvider>");
  const { state, me } = useRoom();
  const { choice, setChoice } = ctx;
  const members = state?.members ?? [];
  const canAddFor = !!me && (me.role === "host" || me.role === "cohost") && members.some((m) => m.id !== me.id);
  const asId = canAddFor && choice.asId && choice.asId !== me?.id && members.some((m) => m.id === choice.asId) ? choice.asId : null;
  const baseId = asId ?? me?.id;
  const partnerIds = choice.partnerIds.filter((id) => id !== baseId && members.some((m) => m.id === id));
  const enabled = !!state?.settings.duets && members.some((m) => m.id !== baseId);
  const on = enabled && choice.everyone && !asId;
  const partners = enabled ? partnerIds : [];
  const nameOf = (id: string) => members.find((m) => m.id === id)?.nickname ?? "someone";
  const names = partners.map(nameOf);

  return {
    enabled,
    canAddFor,
    asId,
    setAs: (id) => setChoice({ everyone: false, partnerIds: [], asId: id }),
    everyone: on,
    partnerIds: partners,
    toggleMember: (id) =>
      setChoice({
        asId,
        everyone: false,
        partnerIds: choice.partnerIds.includes(id) ? choice.partnerIds.filter((x) => x !== id) : [...choice.partnerIds, id],
      }),
    setEveryone: (v) => setChoice({ everyone: v, partnerIds: [], asId: null }),
    solo: () => setChoice({ everyone: false, partnerIds: [], asId }),
    singers: () => {
      if (on) return { everyone: true };
      if (asId) return { singerIds: [asId, ...partners] };
      if (partners.length && me) return { singerIds: [me.id, ...partners] };
      return undefined;
    },
    reset: () => setChoice({ everyone: false, partnerIds: [], asId: null }),
    label: on
      ? "Everyone sings"
      : asId
        ? `For ${[nameOf(asId), ...names].join(" & ")}`
        : names.length
          ? `With ${names.join(" & ")}`
          : "Just me",
  };
}

/** Inline chips. Hosts first pick who is singing (themselves or someone else); then: Just them · Everyone sings · partners. */
export function SingWithPicker({ className }: { className?: string }) {
  const { state, me } = useRoom();
  const sw = useSingWith();
  if (!state || !me || (!sw.enabled && !sw.canAddFor)) return null;
  const baseId = sw.asId ?? me.id;
  const solo = !sw.everyone && sw.partnerIds.length === 0;
  const byAway = (a: { connected: boolean }, b: { connected: boolean }) => Number(b.connected) - Number(a.connected);
  const others = [...state.members].filter((m) => m.id !== me.id).sort((a, b) => Number(!!b.phoneless) - Number(!!a.phoneless) || byAway(a, b));
  const partners = [...state.members].filter((m) => m.id !== baseId).sort((a, b) => byAway(a, b));
  return (
    <div className={className} role="group" aria-label="Who sings?">
      {sw.canAddFor && (
        <>
          <div className={css.groupLabel}>Who's singing?</div>
          <div className={css.chips}>
            <button type="button" className={css.opt} aria-pressed={!sw.asId} onClick={() => sw.setAs(null)}>
              <Avatar seed={me.avatarSeed} size={20} />
              <span className={css.name}>Me</span>
            </button>
            {others.map((m) => (
              <button key={m.id} type="button" className={css.opt} aria-pressed={sw.asId === m.id} onClick={() => sw.setAs(m.id)}>
                <Avatar seed={m.avatarSeed} size={20} />
                <span className={css.name}>{m.nickname}</span>
                {m.phoneless && <Phone size={12} className={css.noPhone} aria-label="No phone" />}
              </button>
            ))}
          </div>
        </>
      )}
      {sw.enabled && (
        <>
          {sw.canAddFor && <div className={css.groupLabel}>Duet or group song</div>}
          <div className={css.chips}>
            <button type="button" className={css.opt} aria-pressed={solo} onClick={sw.solo}>
              <User size={16} /> {sw.asId ? "Just them" : "Just me"}
            </button>
            {!sw.asId && (
              <button type="button" className={css.opt} aria-pressed={sw.everyone} onClick={() => sw.setEveryone(!sw.everyone)}>
                <PartyPopper size={16} /> Everyone sings
              </button>
            )}
            {partners.map((m) => (
              <button
                key={m.id}
                type="button"
                className={css.opt}
                aria-pressed={sw.partnerIds.includes(m.id)}
                onClick={() => sw.toggleMember(m.id)}
                title={m.connected ? undefined : "Away right now"}
              >
                <Avatar seed={m.avatarSeed} size={20} />
                <span className={css.name}>{m.id === me.id ? "Me" : m.nickname}</span>
                {sw.partnerIds.includes(m.id) && <Check size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** A pill showing who sings the next song; tap opens the "Sing with…" sheet. Renders nothing when duets are off. */
export function SingWithButton({ className }: { className?: string }) {
  const sw = useSingWith();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!sw.enabled && !sw.canAddFor) return null;
  const solo = !sw.everyone && sw.partnerIds.length === 0 && !sw.asId;
  return (
    <>
      <button
        type="button"
        className={`${css.pill} ${solo ? "" : css.pillOn} ${className ?? ""}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Users size={16} />
        <span>{solo ? (sw.canAddFor ? "Who sings?" : "Sing with…") : sw.label}</span>
      </button>
      <Sheet open={open} onClose={close} label="Sing with">
        <div className={css.sheet}>
          <h2 className={css.sheetTitle}>{sw.canAddFor ? "Who sings?" : "Sing with…"}</h2>
          <p className={css.sheetText}>
            {sw.canAddFor
              ? "Add the next song for yourself or for someone else, like a guest without a phone. You can also pick partners for a duet. It applies to the next song you add."
              : "Pick partners for a duet, or let the whole room sing. It applies to the next song you add."}
          </p>
          <SingWithPicker />
          <Button block onClick={close}>
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}
