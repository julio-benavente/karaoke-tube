import { BellRing, X } from "lucide-react";
import { useTurnAlert } from "@karaoke-tube/ui";
import css from "./Alerts.module.css";

/** C2: "You're up in 2 songs" then "You're up next!" over every guest screen. Dismissible; hides itself after a few seconds. */
export function TurnAlertBanner() {
  const { alert, dismiss } = useTurnAlert();
  if (!alert) return null;
  return (
    <div className={css.turnWrap} role="status" aria-live="polite">
      <div className={`${css.turn} ${alert.stage === "soon" ? css.soon : css.urgent}`} key={alert.key} data-testid="turn-alert">
        <BellRing size={20} aria-hidden />
        <span className={css.turnText}>{alert.message}</span>
        <button type="button" className={css.close} onClick={dismiss} aria-label="Dismiss">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
