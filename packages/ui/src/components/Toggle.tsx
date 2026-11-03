import clsx from "clsx";
import { useId } from "react";
import css from "./Toggle.module.css";

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Hide the label visually (still read by screen readers). */
  hideLabel?: boolean;
};

/** Switch. Pink when on. */
export function Toggle({ checked, onChange, label, description, disabled, hideLabel }: ToggleProps) {
  const id = useId();
  const sw = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      className={clsx(css.switch, checked && css.on)}
      onClick={() => onChange(!checked)}
    >
      <span className={css.thumb} />
    </button>
  );
  if (hideLabel) return sw;
  return (
    <div className={css.field}>
      <label htmlFor={id} className={css.text}>
        <span className={css.label}>{label}</span>
        {description && (
          <span id={`${id}-d`} className={css.desc}>
            {description}
          </span>
        )}
      </label>
      {sw}
    </div>
  );
}
