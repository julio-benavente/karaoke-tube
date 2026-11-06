import { Minus, Plus, QrCode } from "lucide-react";
import type { JoinInfoMode, QueueMode, RoomSettings } from "@karaoke-tube/shared";
import { Button, LanguageSwitcher, Toggle, useRoom, useT, type TFn, type TKey } from "@karaoke-tube/ui";
import { TvScreenSettings } from "./TvScreenSettings";
import css from "./host.module.css";

const JOIN_OPTIONS: Array<[JoinInfoMode, TKey]> = [
  ["between", "settings.joinBetween"],
  ["always", "settings.joinAlways"],
  ["start", "settings.joinStart"],
];

/** H2: every RoomSettings field, applied live. */
export function SettingsView() {
  const { state, send } = useRoom();
  const t = useT();
  if (!state) return null;
  const s = state.settings;
  const set = (patch: Partial<RoomSettings>) => send({ type: "update_settings", settings: patch });

  return (
    <div className={css.view}>
      <h1 className={css.pageTitle}>{t("nav.settings")}</h1>

      <section className={css.settingsGroup}>
        <div className={css.settingRow}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>{t("lang.label")}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </section>

      <TvScreenSettings />

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>{t("settings.queue")}</h2>
        <div className={`${css.settingRow} ${css.settingStack}`}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>{t("settings.queueOrder")}</span>
            <span className={css.settingDesc}>
              {s.queueMode === "rotation"
                ? t("settings.rotationDesc")
                : s.queueMode === "fifo"
                  ? t("settings.fifoDesc")
                  : t("settings.approvalDesc")}
            </span>
          </div>
          <div className={css.segmented} role="radiogroup" aria-label={t("settings.queueOrder")}>
            {(
              [
                ["rotation", t("settings.rotation")],
                ["fifo", t("settings.fifo")],
                ["approval", t("settings.approval")],
              ] as Array<[QueueMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={s.queueMode === mode}
                className={s.queueMode === mode ? css.segOn : ""}
                onClick={() => set({ queueMode: mode })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Stepper
          t={t}
          label={t("settings.maxWaiting")}
          description={t("settings.maxWaitingDesc")}
          value={s.maxWaitingPerMember}
          min={1}
          max={10}
          onChange={(v) => set({ maxWaitingPerMember: v })}
        />
        <Toggle
          label={t("settings.hostsOnly")}
          description={t("settings.hostsOnlyDesc")}
          checked={s.hostsOnlyAdd}
          onChange={(v) => set({ hostsOnlyAdd: v })}
        />
      </section>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>{t("settings.party")}</h2>
        <Toggle
          label={t("settings.lock")}
          description={t("settings.lockDesc")}
          checked={s.locked}
          onChange={(v) => set({ locked: v })}
        />
        <div className={`${css.settingRow} ${css.settingStack}`}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>{t("settings.joinTv")}</span>
            <span className={css.settingDesc}>{t("settings.joinTvDesc")}</span>
          </div>
          <select
            className={css.select}
            aria-label={t("settings.joinTv")}
            value={s.joinInfo}
            onChange={(e) => set({ joinInfo: e.target.value as JoinInfoMode })}
          >
            {JOIN_OPTIONS.map(([mode, label]) => (
              <option key={mode} value={mode}>
                {t(label)}
              </option>
            ))}
          </select>
        </div>
        <div className={css.settingRow}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>{t("settings.showCode")}</span>
            <span className={css.settingDesc}>{t("settings.showCodeDesc")}</span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<QrCode size={16} />}
            disabled={!state.playerConnected}
            title={state.playerConnected ? undefined : t("settings.openTvFirst")}
            onClick={() => send({ type: "show_join" })}
          >
            {t("settings.showCodeBtn")}
          </Button>
        </div>
        <Toggle
          label={t("settings.reactions")}
          description={t("settings.reactionsDesc")}
          checked={s.reactions}
          onChange={(v) => set({ reactions: v })}
        />
      </section>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>{t("settings.fun")}</h2>
        <Toggle
          label={t("settings.duets")}
          description={t("settings.duetsDesc")}
          checked={s.duets}
          onChange={(v) => set({ duets: v })}
        />
        <Toggle
          label={t("settings.hideExplicit")}
          description={t("settings.hideExplicitDesc")}
          checked={!!s.hideExplicit}
          onChange={(v) => set({ hideExplicit: v })}
        />
        <Toggle
          label={t("settings.hideCovers")}
          description={t("settings.hideCoversDesc")}
          checked={!!s.hideCovers}
          onChange={(v) => set({ hideCovers: v })}
        />
        <Toggle
          label={t("settings.turnAlerts")}
          description={t("settings.turnAlertsDesc")}
          checked={s.turnAlerts}
          onChange={(v) => set({ turnAlerts: v })}
        />
        <Toggle
          label={t("settings.awards")}
          description={t("settings.awardsDesc")}
          checked={s.awards}
          onChange={(v) => set({ awards: v })}
        />
        <Toggle
          label={t("settings.titles")}
          description={t("settings.titlesDesc")}
          checked={s.titles}
          onChange={(v) => set({ titles: v })}
        />
      </section>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>{t("settings.between")}</h2>
        <Toggle
          label={t("settings.getReady")}
          description={t("settings.getReadyDesc")}
          checked={s.getReadyCard}
          onChange={(v) => set({ getReadyCard: v })}
        />
        <Stepper
          t={t}
          label={t("settings.countdown")}
          description={t("settings.countdownDesc")}
          value={s.countdownSec}
          min={3}
          max={30}
          unit="s"
          disabled={!s.getReadyCard}
          onChange={(v) => set({ countdownSec: v })}
        />
      </section>
    </div>
  );
}

function Stepper(props: {
  t: TFn;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const { t, label, description, value, min, max, unit = "", disabled, onChange } = props;
  return (
    <div className={`${css.settingRow} ${disabled ? css.settingDisabled : ""}`}>
      <div className={css.settingText}>
        <span className={css.settingLabel}>{label}</span>
        <span className={css.settingDesc}>{description}</span>
      </div>
      <div className={css.stepper}>
        <button type="button" aria-label={t("settings.less", { label })} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} />
        </button>
        <span className={css.stepValue} aria-live="polite">
          {value}
          {unit}
        </span>
        <button type="button" aria-label={t("settings.more", { label })} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
