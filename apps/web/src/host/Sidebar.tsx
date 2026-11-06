import { formatRoomCode } from "@karaoke-tube/shared";
import { Check, ChevronDown, Copy, Crown, Home, ListPlus, MoreHorizontal, PhoneOff, Search, Settings, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Member } from "@karaoke-tube/shared";
import { AddGuestSheet, Avatar, Button, LanguageSwitcher, Logo, Pill, Toggle, useRoom, useSingWith, useT } from "@karaoke-tube/ui";
import { WEB_URL } from "./client";
import type { View } from "./HostApp";
import css from "./host.module.css";

/** Left column: brand + nav panel, then "Your party" with code, QR and guests. */
export function Sidebar({ view, onView, only, actions }: { view: View; onView: (v: View) => void; only?: "party"; actions?: ReactNode }) {
  const { state, me } = useRoom();
  const t = useT();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addGuest, setAddGuest] = useState(false);
  const sections = useSections();
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
    { key: "home", label: t("tab.home"), icon: Home },
    { key: "search", label: t("tab.search"), icon: Search },
    { key: "settings", label: t("nav.settings"), icon: Settings },
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

      <div className={`${css.panel} ${css.party}`}>
        <Section
          id="party"
          title={t("party.title")}
          aside={state.settings.locked ? <Pill tone="warning">{t("host.locked")}</Pill> : undefined}
          open={sections.isOpen("party")}
          onToggle={sections.toggle}
        >
          <div className={css.joinCard}>
            <div className={css.qr}>{qr ? <img src={qr} alt={t("host.qrAlt", { code })} /> : <span />}</div>
            <div className={css.joinText}>
              <span className={css.codeLabel}>{t("host.code")}</span>
              <span className={css.code}>{formatRoomCode(code)}</span>
              <button type="button" className={css.copy} onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t("host.copied") : t("host.copyLink")}
              </button>
            </div>
          </div>
          {actions}
        </Section>
        <Section id="quick" title={t("host.quick")} open={sections.isOpen("quick")} onToggle={sections.toggle}>
          <QuickSettings />
        </Section>
        <Section
          id="guests"
          title={t("host.guests")}
          aside={<span className={css.muted}>{t("host.hereCount", { n: state.members.filter((m) => m.connected).length })}</span>}
          open={sections.isOpen("guests")}
          onToggle={sections.toggle}
          grow
        >
          <div className={css.addGuest}>
            <Button size="sm" variant="secondary" icon={<UserPlus size={16} />} onClick={() => setAddGuest(true)}>
              {t("host.addGuest")}
            </Button>
          </div>
          <ul className={css.guests}>
            {members.map((m) => (
              <GuestRow key={m.id} member={m} temp={m.id === state.tempHostId} isMe={m.id === me.id} canManage={me.role === "host" && m.id !== me.id} onAddFor={() => onView("search")} />
            ))}
          </ul>
        </Section>
      </div>
      <AddGuestSheet open={addGuest} onClose={() => setAddGuest(false)} />
    </aside>
  );
}

const SECTIONS_KEY = "kt:host:sections";
type SectionId = "party" | "quick" | "guests";

/** Which left-side sections the host folded away; remembered on this device. */
function useSections() {
  const [closed, setClosed] = useState<SectionId[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "[]") as unknown;
      return Array.isArray(v) ? (v.filter((x) => x === "party" || x === "quick" || x === "guests") as SectionId[]) : [];
    } catch {
      return [];
    }
  });
  const toggle = (id: SectionId) =>
    setClosed((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // storage blocked: the choice lasts until reload
      }
      return next;
    });
  return { isOpen: (id: SectionId) => !closed.includes(id), toggle };
}

/** A left-side section with a header that folds it open and closed. */
function Section({ id, title, aside, open, onToggle, grow, children }: { id: SectionId; title: ReactNode; aside?: ReactNode; open: boolean; onToggle: (id: SectionId) => void; grow?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <section className={`${css.sec} ${grow && open ? css.secGrow : ""}`} data-section={id}>
      <button type="button" className={css.secHead} aria-expanded={open} aria-controls={`sec-${id}`} onClick={() => onToggle(id)} title={open ? t("host.collapse") : t("host.expand")}>
        <ChevronDown size={16} className={`${css.secChevron} ${open ? "" : css.secClosed}`} aria-hidden />
        <span className={css.secTitle}>{title}</span>
        {aside}
      </button>
      {open && (
        <div id={`sec-${id}`} className={css.secBody}>
          {children}
        </div>
      )}
    </section>
  );
}

/** Quick settings: the few switches a host reaches for during the night. Everything else lives in Settings. */
function QuickSettings() {
  const { state, send } = useRoom();
  const t = useT();
  if (!state) return null;
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => send({ type: "update_settings", settings: patch });
  return (
    <div className={css.quick} data-testid="quick-settings">
      <Toggle label={t("settings.lock")} checked={s.locked} onChange={(v) => set({ locked: v })} />
      <Toggle label={t("settings.tvHideBar")} checked={!!s.tvHideBar} onChange={(v) => set({ tvHideBar: v })} />
      <Toggle label={t("settings.hideExplicit")} checked={!!s.hideExplicit} onChange={(v) => set({ hideExplicit: v })} />
      <Toggle label={t("settings.reactions")} checked={s.reactions} onChange={(v) => set({ reactions: v })} />
      <Toggle label={t("settings.hideCovers")} checked={!!s.hideCovers} onChange={(v) => set({ hideCovers: v })} />
      <div className={css.quickLang}>
        <span className={css.quickLabel}>{t("lang.label")}</span>
        <LanguageSwitcher />
      </div>
    </div>
  );
}

function GuestRow({ member, temp, isMe, canManage, onAddFor }: { member: Member; temp: boolean; isMe: boolean; canManage: boolean; onAddFor: () => void }) {
  const { send } = useRoom();
  const t = useT();
  const sing = useSingWith();
  const canAddFor = sing.canAddFor && !isMe;
  const canKick = canManage || (member.phoneless && sing.canAddFor);
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
          {isMe && <span className={css.muted}> {t("party.you")}</span>}
        </span>
        <span className={css.guestRole}>
          {member.role === "host" ? (
            <>
              <Crown size={11} /> {temp ? t("party.tempHost") : t("role.host")}
            </>
          ) : member.role === "cohost" ? (
            t("party.cohost")
          ) : member.phoneless ? (
            <>
              <PhoneOff size={11} /> {t("party.noPhone")}
            </>
          ) : member.connected ? (
            t("role.guest")
          ) : (
            t("party.away")
          )}
        </span>
      </div>
      {(canManage || canAddFor || canKick) && (
        <button
          type="button"
          className={css.guestMore}
          onClick={() => setOpen(!open)}
          aria-label={t("host.optionsFor", { name: member.nickname })}
          aria-expanded={open}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      {open && (
        <div className={css.menu} role="menu">
          {canAddFor && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                sing.setAs(member.id);
                setOpen(false);
                onAddFor();
              }}
            >
              <ListPlus size={16} />
              {t("party.addSongFor", { name: member.nickname })}
            </button>
          )}
          {canManage && !member.phoneless && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                send({ type: "set_role", memberId: member.id, role: member.role === "cohost" ? "guest" : "cohost" });
                setOpen(false);
              }}
            >
              <ShieldCheck size={16} />
              {member.role === "cohost" ? t("party.removeCohost") : t("party.makeCohost")}
            </button>
          )}
          {canKick && (
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
              {t("party.removeGuest")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
