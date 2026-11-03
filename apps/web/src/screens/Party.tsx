import { useT } from "@karaoke-tube/ui";
import { formatRoomCode } from "@karaoke-tube/shared";
import { Check, Copy, Crown, ListPlus, LogOut, MoreHorizontal, Share2, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useNavigate } from "react-router";
import { useState } from "react";
import type { Member } from "@karaoke-tube/shared";
import { ActionList, AddGuestSheet, Avatar, Button, Pill, Sheet, useRoom, useSingWith } from "@karaoke-tube/ui";
import { useShell } from "./RoomShell";
import css from "./Party.module.css";

/** Party tab: room code, guests list, leave. */
export function PartyScreen() {
  const t = useT();
  const { state, me, isHost, send } = useRoom();
  const { code, leave } = useShell();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menu, setMenu] = useState<Member | null>(null);
  const [addGuest, setAddGuest] = useState(false);
  const sing = useSingWith();
  const navigate = useNavigate();
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
      <h1 className={css.title}>{t("party.title")}</h1>

      <section className={css.codeCard}>
        <span className={css.codeLabel}>{t("party.code")}</span>
        <span className={css.code} aria-label={`Code ${formatRoomCode(code)}`}>
          {formatRoomCode(code)}
        </span>
        <p className={css.codeHint}>Friends join at {location.host}/join with this code.</p>
        <Button variant="light" size="sm" icon={copied ? <Check size={16} /> : canShare ? <Share2 size={16} /> : <Copy size={16} />} onClick={share}>
          {copied ? t("party.copied") : t("party.invite")}
        </Button>
      </section>

      <section>
        <h2 className={css.h2}>
          {t("host.guests")} <span className={css.count}>{t("host.hereCount", { n: online })}</span>
        </h2>
        {isHost && (
          <Button variant="secondary" size="sm" icon={<UserPlus size={16} />} onClick={() => setAddGuest(true)} className={css.addGuest}>
            {t("host.addGuest")}
          </Button>
        )}
        <ul className={css.list}>
          {members.map((m) => (
            <li key={m.id} className={css.member}>
              <Avatar seed={m.avatarSeed} size={44} online={m.connected} />
              <div className={css.memberText}>
                <span className={css.name}>
                  {m.nickname}
                  {m.id === me.id && <span className={css.you}> {t("party.you")}</span>}
                </span>
                <span className={css.status}>{m.phoneless ? t("party.noPhone") : m.connected ? t("party.here") : t("party.away")}</span>
              </div>
              {m.role === "host" && (
                <Pill tone="accent">
                  <Crown size={11} /> {m.id === state.tempHostId ? t("party.tempHost") : t("role.host")}
                </Pill>
              )}
              {m.role === "cohost" && <Pill>{t("party.cohost")}</Pill>}
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
        {t("party.leaveLabel")}
      </Button>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label={t("party.leaveLabel")}>
        <div className={css.confirm}>
          <h2 className={css.h2}>{t("party.leaveTitle")}</h2>
          <p className={css.muted}>{me.role === "host" && me.id !== state.tempHostId ? t("party.leaveHostText") : t("party.leaveText", { code: formatRoomCode(code) })}</p>
          <div className={css.confirmButtons}>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              {t("party.stay")}
            </Button>
            <Button onClick={leave}>{t("party.leave")}</Button>
          </div>
        </div>
      </Sheet>

      <AddGuestSheet open={addGuest} onClose={() => setAddGuest(false)} />

      <Sheet open={!!menu} onClose={() => setMenu(null)} label={t("party.guestOptions")}>
        {menu && (
          <>
            <div className={css.menuHead}>
              <Avatar seed={menu.avatarSeed} size={40} />
              <span className={css.name}>{menu.nickname}</span>
            </div>
            <ActionList
              items={[
                ...(sing.canAddFor
                  ? [
                      {
                        key: "addfor",
                        label: t("party.addSongFor", { name: menu.nickname }),
                        icon: <ListPlus />,
                        danger: false,
                        onClick: () => {
                          sing.setAs(menu.id);
                          navigate(`/r/${code}/search`);
                        },
                      },
                    ]
                  : []),
                ...(me.role === "host" && !menu.phoneless
                  ? [
                      menu.role === "cohost"
                        ? {
                            key: "role",
                            label: t("party.removeCohost"),
                            icon: <ShieldCheck />,
                            onClick: () => send({ type: "set_role", memberId: menu.id, role: "guest" }),
                          }
                        : {
                            key: "role",
                            label: t("party.makeCohost"),
                            icon: <ShieldCheck />,
                            onClick: () => send({ type: "set_role", memberId: menu.id, role: "cohost" }),
                          },
                    ]
                  : []),
                {
                  key: "kick",
                  label: t("party.removeGuest"),
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
