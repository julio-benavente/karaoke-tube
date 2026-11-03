import { useState, type FormEvent } from "react";
import { MonitorUp, Tv } from "lucide-react";
import { localStorageCredentials } from "@karaoke-tube/client";
import type { PairClaimRequest } from "@karaoke-tube/shared";
import { Button, TextField, useRoom, useT, useToast } from "@karaoke-tube/ui";
import { openTvScreen } from "./client";
import css from "./host.module.css";

/**
 * Settings → TV screen. A TV opened at /tv shows a code; typing it here pairs it with this party, and from then
 * on the TV stays the party's screen no matter who is hosting. The host can also remove it.
 */
export function TvScreenSettings() {
  const { state, me, send } = useRoom();
  const t = useT();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!state) return null;
  const isHost = me?.role === "host";
  const paired = state.screenPaired === true;
  const connected = state.playerConnected === true;

  const pair = async (e: FormEvent) => {
    e.preventDefault();
    const creds = localStorageCredentials().load(state.code);
    const clean = code.replace(/[\s-]/g, "").toUpperCase();
    if (!creds || clean.length !== 6 || busy) return setError(t("tvscreen.codeHint"));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pair/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: clean, roomCode: state.code, memberId: creds.memberId, key: creds.key } satisfies PairClaimRequest),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(res.status === 404 ? t("tvscreen.notFound") : res.status === 403 ? t("tvscreen.notHost") : (body?.message ?? t("tvscreen.error")));
        return;
      }
      setCode("");
      toast.show(t("tvscreen.paired"));
    } catch {
      setError(t("tvscreen.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={css.settingsGroup} data-testid="tv-screen-settings">
      <h2 className={css.h2}>{t("tvscreen.title")}</h2>
      <div className={css.settingRow}>
        <div className={css.settingText}>
          <span className={css.settingLabel}>
            <Tv size={14} /> {paired ? (connected ? t("tvscreen.connected") : t("tvscreen.offline")) : t("tvscreen.none")}
          </span>
          <span className={css.settingDesc}>{paired ? t("tvscreen.pairedDesc") : t("tvscreen.noneDesc")}</span>
        </div>
        {paired && isHost && !confirmRemove && (
          <Button size="sm" variant="secondary" onClick={() => setConfirmRemove(true)}>
            {t("tvscreen.remove")}
          </Button>
        )}
        {paired && isHost && confirmRemove && (
          <span style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => setConfirmRemove(false)}>
              {t("tvscreen.keep")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                send({ type: "remove_screen" });
                setConfirmRemove(false);
              }}
            >
              {t("tvscreen.removeConfirm")}
            </Button>
          </span>
        )}
      </div>
      {isHost && (
        <form className={css.settingRow} onSubmit={pair}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>{paired ? t("tvscreen.replace") : t("tvscreen.pair")}</span>
            <span className={css.settingDesc}>{t("tvscreen.pairDesc", { url: `${location.host}/tv` })}</span>
            <TextField
              label={t("tvscreen.codeLabel")}
              hideLabel
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC 123"
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              error={error}
              data-testid="tv-pair-input"
            />
          </div>
          <Button size="sm" type="submit" disabled={busy || code.replace(/[\s-]/g, "").length !== 6}>
            {t("tvscreen.pairButton")}
          </Button>
        </form>
      )}
      <div className={css.settingRow}>
        <div className={css.settingText}>
          <span className={css.settingLabel}>{t("tvscreen.thisComputer")}</span>
          <span className={css.settingDesc}>{t("tvscreen.thisComputerDesc")}</span>
        </div>
        <Button size="sm" variant="secondary" icon={<MonitorUp size={16} />} onClick={() => openTvScreen(state.code)}>
          {t("host.openTv")}
        </Button>
      </div>
    </section>
  );
}
