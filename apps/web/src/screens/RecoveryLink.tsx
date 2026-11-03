import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import type { Role } from "@karaoke-tube/shared";
import { Button, useT } from "@karaoke-tube/ui";
import { recoveryLink } from "../recovery";
import css from "./RecoveryLink.module.css";

/** "Your rejoin link": copy a private link that gets this member back in from any device. */
export function RecoveryLink({ code, role }: { code: string; role: Role }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const link = recoveryLink(code, role);
  if (!link) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("recovery.title"), link); // clipboard blocked: let them copy it by hand
    }
  };
  return (
    <section className={css.card}>
      <h2 className={css.title}>
        <KeyRound size={16} /> {t("recovery.title")}
      </h2>
      <p className={css.hint}>{t(role === "host" ? "recovery.hintHost" : "recovery.hint")}</p>
      <Button variant="secondary" size="sm" icon={copied ? <Check size={16} /> : undefined} onClick={copy}>
        {copied ? t("recovery.copied") : t("recovery.copy")}
      </Button>
    </section>
  );
}
