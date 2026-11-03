import { formatRoomCode } from "@karaoke-tube/shared";
import { Check, Copy, Crown, Home, MoreHorizontal, Search, Settings, ShieldCheck, UserMinus } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Member } from "@karaoke-tube/shared";
import { Avatar, Logo, Pill, useRoom } from "@karaoke-tube/ui";
import { WEB_URL } from "./client";
import type { View } from "./HostApp";
import css from "./host.module.css";

/** Left column: brand + nav panel, then "Your party" with code, QR and guests. */
export function Sidebar({ view, onView, only, actions }: { view: View; onView: (v: View) => void; only?: "party"; actions?: ReactNode }) {
  const { state, me } = useRoom();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const code = state?.code ?? "";
  const joinUrl = `${WEB_URL}/join/${code}`;

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360, color: { dark: "#070609", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [joinUrl, code]);

  if (!state || !me) return null;
  const order = { host: 0, cohost: 1, guest: 2 } as const;
  const members = [...state.members].sort(
    (a, b) => order[a.role] - order[b.role] || Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const nav: Array<{ key: View; label: string; icon: typeof Home }> = [
    { key: "home", label: "Home", icon: Home },
    { key: "search", label: "Search", icon: Search },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className={`${css.sidebar} ${only ? css.partyOnly : ""}`}>
      {!only && (
      <nav className={css.panel}>
        <div className={css.brand}>
          <Logo size={28} />
        </div>
        {nav.map((n) => (
          <button
            key={n.key}
            type="button"
            className={`${css.navItem} ${view === n.key ? css.navOn : ""}`}
            aria-current={view === n.key ? "page" : undefined}
            onClick={() => onView(n.key)}
          >
            <n.icon size={24} strokeWidth={view === n.key ? 2.6 : 2} />
            {n.label}
          </button>
        ))}
      </nav>
      )}

      <section className={`${css.panel} ${css.party}`}>
        <header className={css.partyHead}>
          <h2 className={css.partyTitle}>Your party</h2>
          {state.settings.locked && <Pill tone="warning">Locked</Pill>}
        </header>
        <div className={css.joinCard}>
          <div className={css.qr}>{qr ? <img src={qr} alt={`QR code to join party ${code}`} /> : <span />}</div>
          <div className={css.joinText}>
            <span className={css.codeLabel}>Code</span>
            <span className={css.code}>{formatRoomCode(code)}</span>
            <button type="button" className={css.copy} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
        {actions}
        <h3 className={css.guestsTitle}>
          Guests <span className={css.muted}>{state.members.filter((m) => m.connected).length} here</span>
        </h3>
        <ul className={css.guests}>
          {members.map((m) => (
            <GuestRow key={m.id} member={m} isMe={m.id === me.id} canManage={me.role === "host" && m.id !== me.id} />
          ))}
        </ul>
      </section>
    </aside>
  );
}

function GuestRow({ member, isMe, canManage }: { member: Member; isMe: boolean; canManage: boolean }) {
  const { send } = useRoom();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <li ref={ref} className={css.guest}>
      <Avatar seed={member.avatarSeed} size={36} online={member.connected} />
      <div className={css.guestText}>
        <span className={css.guestName}>
          {member.nickname}
          {isMe && <span className={css.muted}> (you)</span>}
        </span>
        <span className={css.guestRole}>
          {member.role === "host" ? (
            <>
              <Crown size={11} /> Host
            </>
          ) : member.role === "cohost" ? (
            "Co-host"
          ) : member.connected ? (
            "Guest"
          ) : (
            "Away"
          )}
        </span>
      </div>
      {canManage && (
        <button
          type="button"
          className={css.guestMore}
          onClick={() => setOpen(!open)}
          aria-label={`Options for ${member.nickname}`}
          aria-expanded={open}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      {open && (
        <div className={css.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              send({ type: "set_role", memberId: member.id, role: member.role === "cohost" ? "guest" : "cohost" });
              setOpen(false);
            }}
          >
            <ShieldCheck size={16} />
            {member.role === "cohost" ? "Remove co-host" : "Make co-host"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={css.menuDanger}
            onClick={() => {
              send({ type: "kick", memberId: member.id });
              setOpen(false);
            }}
          >
            <UserMinus size={16} />
            Remove from party
          </button>
        </div>
      )}
    </li>
  );
}
