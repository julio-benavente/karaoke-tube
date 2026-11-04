import { Link } from "react-router";
import { LanguageSwitcher, Logo, useLang, useT } from "@karaoke-tube/ui";
import { LEGAL } from "./legalText";
import css from "./Legal.module.css";

/** /privacy and /terms: public, plain text in the chosen language. */
export function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const t = useT();
  const [lang] = useLang();
  const text = LEGAL[doc][lang] ?? LEGAL[doc].en;
  return (
    <div className={css.page}>
      <header className={css.top}>
        <Link to="/" aria-label={t("legal.home")}>
          <Logo size={32} />
        </Link>
      </header>
      <main className={css.card}>
        <h1 className={css.title}>{text.title}</h1>
        <p className={css.updated}>{text.updated}</p>
        {text.sections.map((s) => (
          <section key={s.h}>
            <h2 className={css.h}>{s.h}</h2>
            {s.p.map((p) => (
              <p key={p} className={css.p}>
                {p}
              </p>
            ))}
          </section>
        ))}
        <nav className={css.links}>
          <Link to="/">{t("legal.home")}</Link>
          <Link to={doc === "privacy" ? "/terms" : "/privacy"}>{LEGAL[doc === "privacy" ? "terms" : "privacy"][lang].title}</Link>
        </nav>
      </main>
      <LanguageSwitcher />
    </div>
  );
}
