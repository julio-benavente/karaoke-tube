import { Chip } from "../components/Chip";
import { LANGS } from "./core";
import { useLang, useT } from "./context";

/** Two pills: English | Español. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const [lang, setLang] = useLang();
  const t = useT();
  return (
    <div role="group" aria-label={t("lang.label")} className={className} style={{ display: "flex", gap: "var(--kt-space-2)" }}>
      {LANGS.map((l) => (
        <Chip key={l.id} selected={lang === l.id} lang={l.id} onClick={() => setLang(l.id)}>
          {l.label}
        </Chip>
      ))}
    </div>
  );
}
