import { useT } from "@karaoke-tube/ui";

const box = { position: "fixed", inset: 0, height: "100dvh", background: "#000", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24, fontFamily: '"Figtree", system-ui, sans-serif' } as const;

/** Shown instead of the TV (no Start button) on the host's own phone: a phone freezes this tab the moment the host goes back to the host panel. */
export function SamePhoneWarning({ code }: { code: string }) {
  const t = useT();
  return (
    <div style={box} data-testid="tv-same-phone">
      <h1 style={{ margin: 0 }}>{t("tv.samePhoneTitle")}</h1>
      <p style={{ maxWidth: "32em", margin: 0, opacity: 0.85 }}>{t("host.phoneNotTv")}</p>
      <a style={{ color: "#ff4f8b", fontWeight: 700 }} href={`/host/${code}`}>
        {t("tv.goHost")}
      </a>
    </div>
  );
}
