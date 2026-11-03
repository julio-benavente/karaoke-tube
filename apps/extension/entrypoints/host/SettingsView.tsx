import { Minus, Plus } from "lucide-react";
import type { QueueMode, RoomSettings } from "@karaoke-tube/shared";
import { Toggle, useRoom } from "@karaoke-tube/ui";
import css from "./host.module.css";

/** H2: every RoomSettings field, applied live. */
export function SettingsView() {
  const { state, send } = useRoom();
  if (!state) return null;
  const s = state.settings;
  const set = (patch: Partial<RoomSettings>) => send({ type: "update_settings", settings: patch });

  return (
    <div className={css.view}>
      <h1 className={css.pageTitle}>Settings</h1>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>Queue</h2>
        <div className={css.settingRow}>
          <div className={css.settingText}>
            <span className={css.settingLabel}>Queue order</span>
            <span className={css.settingDesc}>
              {s.queueMode === "rotation"
                ? "Rotation: everyone gets one song per round, so nobody waits forever."
                : "First come, first served: songs play in the order they were added."}
            </span>
          </div>
          <div className={css.segmented} role="radiogroup" aria-label="Queue order">
            {(
              [
                ["rotation", "Rotation"],
                ["fifo", "First come"],
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
          label="Songs waiting per guest"
          description="How many songs each guest can have in the queue at once. Hosts aren't limited."
          value={s.maxWaitingPerMember}
          min={1}
          max={10}
          onChange={(v) => set({ maxWaitingPerMember: v })}
        />
        <Toggle
          label="Only hosts add songs"
          description="Guests can browse and react, but only you and co-hosts can add."
          checked={s.hostsOnlyAdd}
          onChange={(v) => set({ hostsOnlyAdd: v })}
        />
      </section>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>Party</h2>
        <Toggle
          label="Lock the party"
          description="No new guests can join. People already here stay."
          checked={s.locked}
          onChange={(v) => set({ locked: v })}
        />
        <Toggle
          label="Reactions"
          description="Guests can send emoji that float over the video on the TV."
          checked={s.reactions}
          onChange={(v) => set({ reactions: v })}
        />
      </section>

      <section className={css.settingsGroup}>
        <h2 className={css.h2}>Between songs</h2>
        <Toggle
          label="Get-ready card"
          description="Show who's up next on the TV with a countdown before each song."
          checked={s.getReadyCard}
          onChange={(v) => set({ getReadyCard: v })}
        />
        <Stepper
          label="Countdown"
          description="Seconds on the get-ready card."
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
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const { label, description, value, min, max, unit = "", disabled, onChange } = props;
  return (
    <div className={`${css.settingRow} ${disabled ? css.settingDisabled : ""}`}>
      <div className={css.settingText}>
        <span className={css.settingLabel}>{label}</span>
        <span className={css.settingDesc}>{description}</span>
      </div>
      <div className={css.stepper}>
        <button type="button" aria-label={`Less ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} />
        </button>
        <span className={css.stepValue} aria-live="polite">
          {value}
          {unit}
        </span>
        <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
