import { LanguageSwitcher, Logo, useT } from "@karaoke-tube/ui";
import { Link, Navigate } from "react-router";
import { resumableRoom } from "../session";
import css from "./Landing.module.css";

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
        <Link to="/host/new" className={`${css.choice} ${css.primary}`}>
          <span className={css.choiceTitle}>{t("landing.create")}</span>
          <span className={css.choiceHint}>{t("landing.createHint")}</span>
        </Link>
        <Link to="/join" className={css.choice}>
          <span className={css.choiceTitle}>{t("landing.join")}</span>
          <span className={css.choiceHint}>{t("landing.joinHint")}</span>
        </Link>
      </main>
      <LanguageSwitcher />
    </div>
  );
}
