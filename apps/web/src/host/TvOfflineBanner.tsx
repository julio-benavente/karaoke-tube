import { MonitorOff, Tv } from "lucide-react";
import { useState } from "react";
import { Button, TextField, useRoom, useT } from "@karaoke-tube/ui";
import { usePairClaim } from "./pairClaim";
import css from "./TvOfflineBanner.module.css";

/**
 * "TV not connected": a big, unmissable notice (nothing plays until a TV screen is open). It also tells the host how to use
 * a different device: open the TV link on it and type the code it shows. `onOpenTv` opens the TV screen on this computer.
 * On a phone it is a strip along the top with the extra help behind a tap, so it does not eat the screen.
 */
export function TvOfflineBanner({ onOpenTv, compact = false }: { onOpenTv: () => void; compact?: boolean }) {
  const t = useT();
  const { state, me } = useRoom();
  const pair = usePairClaim(state?.code ?? "");
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const isHost = me?.role === "host";
  const link = `${location.host}/tv`;
  const showHelp = !compact || open;

  return (
    <div className={`${css.banner} ${compact ? css.compact : ""}`} role="alert" data-testid="tv-banner">
      <div className={css.top}>
        <span className={css.icon} aria-hidden>
          <MonitorOff size={compact ? 22 : 36} />
        </span>
        <div className={css.text}>
          <b className={css.title}>{state.screenPaired ? t("host.tvOffline") : t("host.noTv")}</b>
          {!compact && <span className={css.hint}>{state.screenPaired ? t("host.tvOfflineHint") : t("host.noTvHint")}</span>}
          {compact && <span className={css.hint}>{t("host.phoneNotTv")}</span>}
        </div>
        {/* On a phone the TV goes on another device (see phone.ts), so there is no "open the TV here" button. */}
        {!compact && (
          <Button size="sm" variant="light" icon={<Tv size={16} />} onClick={onOpenTv}>
            {t("host.openTv")}
          </Button>
        )}
      </div>
      {compact && (
        <button type="button" className={css.more} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {t("host.tvOtherDevice")}
        </button>
      )}
      {showHelp && (
        <div className={css.other} data-testid="tv-other-device">
          <p>{t("host.tvOtherDeviceHint")}</p>
          <p>
            {compact ? (
              <b className={css.link} data-testid="tv-link">
                {link}
              </b>
            ) : (
              <a href="/tv" target="_blank" rel="noreferrer" className={css.link} data-testid="tv-link">
                {link}
              </a>
            )}
          </p>
          {isHost && (
            <form className={css.pair} onSubmit={pair.submit}>
              <TextField
                label={t("tvscreen.codeLabel")}
                hideLabel
                value={pair.code}
                onChange={(e) => pair.setCode(e.target.value)}
                placeholder="12345"
                maxLength={5}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                error={pair.error}
                data-testid="tv-banner-code"
              />
              <Button size="sm" variant="secondary" type="submit" className={css.pairButton} disabled={pair.busy || !pair.ready}>
                {t("tvscreen.pairButton")}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
