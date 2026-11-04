import { LanguageSwitcher, Logo, useT } from "@karaoke-tube/ui";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import type { Role } from "@karaoke-tube/shared";
import { useLiveParties } from "../account/useLiveParties";
import { adoptLiveParty, markHosting, resumableHostRoom, resumableRoom } from "../session";
import css from "./Landing.module.css";

type Back = { code: string; role: Role; go: () => void };

/**
 * "Back to your party": the party this browser hosts (kept on this device) plus the open parties of the signed-in
 * account, which also works on another device or after clearing the browser. Rooms that ended are not offered.
 */
function BackToParty() {
  const t = useT();
  const navigate = useNavigate();
  const live = useLiveParties();
  const [hostCode, setHostCode] = useState<string | null>(null);
  useEffect(() => {
    const code = resumableHostRoom();
    if (!code) return;
    let alive = true;
    fetch(`/api/rooms/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { exists: boolean; status: string | null } | null) => {
        if (!alive) return;
        if (info && (!info.exists || info.status === "ended")) markHosting(code, false);
        else setHostCode(code); // unknown (offline) counts as still there
      })
      .catch(() => alive && setHostCode(code));
    return () => {
      alive = false;
    };
  }, []);
  const items: Back[] = (live ?? []).map((p) => ({ code: p.code, role: p.role, go: () => navigate(adoptLiveParty(p)) }));
  if (hostCode && !items.some((i) => i.code === hostCode)) items.unshift({ code: hostCode, role: "host", go: () => navigate(`/host/${hostCode}`) });
  if (!items.length) return null;
  return (
    <section className={css.back} aria-label={t("resume.title")}>
      <h2 className={css.backTitle}>{t("resume.title")}</h2>
      {items.map((i) => (
        <button key={i.code} type="button" className={css.backItem} onClick={i.go}>
          <span className={css.backCode}>{i.code.replace(/-/g, " ")}</span>
          <span className={css.backRole}>{t(`resume.role.${i.role}`)}</span>
          <span className={css.backGo}>{t("resume.open")}</span>
        </button>
      ))}
    </section>
  );
}

/** Home page: two choices, create a room (host) or join one (guest). Already in a room? Straight back in. */
export function Landing() {
  const t = useT();
  const resume = resumableRoom();
  if (resume) return <Navigate to={`/r/${resume}`} replace />;
  return (
    <div className={css.page}>
      <header className={css.top}>
        <Logo size={32} />
      </header>
      <main className={css.card}>
        <h1 className={css.title}>{t("landing.title")}</h1>
        <p className={css.lead}>{t("landing.lead")}</p>
        <BackToParty />
        <Link to="/host/new" className={`${css.choice} ${css.primary}`}>
          <span className={css.choiceTitle}>{t("landing.create")}</span>
          <span className={css.choiceHint}>{t("landing.createHint")}</span>
        </Link>
        <Link to="/join" className={css.choice}>
          <span className={css.choiceTitle}>{t("landing.join")}</span>
          <span className={css.choiceHint}>{t("landing.joinHint")}</span>
        </Link>
        <Link to="/tv" className={css.tvLink}>
          {t("landing.tv")}
        </Link>
        <nav className={css.legal}>
          <Link to="/privacy">{t("legal.privacy")}</Link>
          <Link to="/terms">{t("legal.terms")}</Link>
        </nav>
      </main>
      <LanguageSwitcher />
    </div>
  );
}
