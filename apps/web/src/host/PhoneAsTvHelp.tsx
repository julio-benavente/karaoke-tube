import { Smartphone } from "lucide-react";
import { useT } from "@karaoke-tube/ui";
import css from "./host.module.css";

/** Settings → TV screen: how to use a phone or tablet as the TV and cast it to a real television (Roku, Apple TV, Chromecast, smart TVs). */
export function PhoneAsTvHelp() {
  const t = useT();
  const link = `${location.host}/tv`;
  return (
    <div className={`${css.settingRow} ${css.settingStack}`} data-testid="phone-as-tv">
      <div className={css.settingText}>
        <span className={`${css.settingLabel} ${css.settingLabelIcon}`}>
          <Smartphone size={14} /> {t("tvscreen.phone.title")}
        </span>
        <span className={css.settingDesc}>{t("tvscreen.phone.desc")}</span>
        <ol style={{ margin: "var(--kt-space-2) 0 0", paddingLeft: "1.2em", display: "grid", gap: 4, fontSize: "var(--kt-text-sm)", color: "var(--kt-text-2)" }}>
          <li>{t("tvscreen.phone.step1", { url: link })}</li>
          <li>{t("tvscreen.phone.step2")}</li>
          <li>{t("tvscreen.phone.step3")}</li>
        </ol>
        <span className={css.settingDesc} style={{ marginTop: "var(--kt-space-2)" }}>
          {t("tvscreen.phone.cast")}
        </span>
      </div>
    </div>
  );
}
