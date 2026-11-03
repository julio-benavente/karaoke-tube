import { Check, Copy, Crown, LogOut, MoreHorizontal, Share2, ShieldCheck, UserMinus } from "lucide-react";
import { useState } from "react";
import type { Member } from "@karaoke-tube/shared";
import { ActionList, Avatar, Button, Pill, Sheet, useRoom } from "@karaoke-tube/ui";
import { useShell } from "./RoomShell";
import css from "./Party.module.css";

/** Party tab: room code, guests list, leave. */
export function PartyScreen() {
  const { state, me, isHost, send } = useRoom();
  const { code, leave } = useShell();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menu, setMenu] = useState<Member | null>(null);
  if (!state || !me) return null;

  const link = `${location.origin}/join/${code}`;
  const canShare = typeof navigator.share === "function";
  const share = async () => {
    try {
      if (canShare) {
        await navigator.share({ title: "Karaoke Tube", text: `Join my karaoke party: ${code}`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // cancelled or blocked
    }
  };

  const order = { host: 0, cohost: 1, guest: 2 } as const;
  const members = [...state.members].sort(
    (a, b) => order[a.role] - order[b.role] || Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt,
  );
  const online = state.members.filter((m) => m.connected).length;

  return (
    <div className={css.page}>
      <h1 className={css.title}>Your party</h1>

      <section className={css.codeCard}>
        <span className={css.codeLabel}>Party code</span>
        <span className={css.code} aria-label={`Code ${code.split("").join(" ")}`}>
          {code}
        </span>
        <p className={css.codeHint}>Friends join at {location.host}/join with this code.</p>
        <Button variant="light" size="sm" icon={copied ? <Check size={16} /> : canShare ? <Share2 size={16} /> : <Copy size={16} />} onClick={share}>
          {copied ? "Link copied" : "Invite friends"}
        </Button>
      </section>

      <section>
        <h2 className={css.h2}>
          Guests <span className={css.count}>{online} here</span>
        </h2>
        <ul className={css.list}>
          {members.map((m) => (
            <li key={m.id} className={css.member}>
              <Avatar seed={m.avatarSeed} size={44} online={m.connected} />
              <div className={css.memberText}>
                <span className={css.name}>
                  {m.nickname}
                  {m.id === me.id && <span className={css.you}> (you)</span>}
                </span>
                <span className={css.status}>{m.connected ? "Here" : "Away"}</span>
              </div>
              {m.role === "host" && (
                <Pill tone="accent">
                  <Crown size={11} /> Host
                </Pill>
              )}
              {m.role === "cohost" && <Pill>Co-host</Pill>}
              {isHost && m.id !== me.id && m.role !== "host" && (
                <button type="button" className={css.more} onClick={() => setMenu(m)} aria-label={`Options for ${m.nickname}`}>
                  <MoreHorizontal />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Button variant="secondary" icon={<LogOut size={18} />} onClick={() => setConfirmLeave(true)} className={css.leave}>
        Leave party
      </Button>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Leave party">
        <div className={css.confirm}>
          <h2 className={css.h2}>Leave the party?</h2>
          <p className={css.muted}>Your songs stay in the queue. You can join again with code {code}.</p>
          <div className={css.confirmButtons}>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
            <Button onClick={leave}>Leave</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!menu} onClose={() => setMenu(null)} label="Guest options">
        {menu && (
          <>
            <div className={css.menuHead}>
              <Avatar seed={menu.avatarSeed} size={40} />
              <span className={css.name}>{menu.nickname}</span>
            </div>
            <ActionList
              items={[
                ...(me.role === "host"
                  ? [
                      menu.role === "cohost"
                        ? {
                            key: "role",
                            label: "Remove co-host",
                            icon: <ShieldCheck />,
                            onClick: () => send({ type: "set_role", memberId: menu.id, role: "guest" }),
                          }
                        : {
                            key: "role",
                            label: "Make co-host",
                            icon: <ShieldCheck />,
                            onClick: () => send({ type: "set_role", memberId: menu.id, role: "cohost" }),
                          },
                    ]
                  : []),
                {
                  key: "kick",
                  label: "Remove from party",
                  icon: <UserMinus />,
                  danger: true,
                  onClick: () => send({ type: "kick", memberId: menu.id }),
                },
              ].map((a) => ({
                ...a,
                onClick: () => {
                  a.onClick();
                  setMenu(null);
                },
              }))}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}
