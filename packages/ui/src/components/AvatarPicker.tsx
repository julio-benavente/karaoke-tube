import clsx from "clsx";
import { Dices, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { SKIN_TONES, avatarOptions, avatarUri, lookOf, randomAvatar, skinToneOf, withSkinTone, type AvatarLook } from "../avatar";
import { Chip, ChipRow } from "./Chip";
import css from "./AvatarPicker.module.css";

const LOOK_LABELS: { look: AvatarLook; label: string }[] = [
  { look: "girl", label: "Girl" },
  { look: "boy", label: "Boy" },
  { look: "any", label: "Anyone" },
];

export type AvatarPickerProps = {
  /** The current avatar seed (a chosen "v2:" seed or an old random one). */
  value: string;
  onChange: (seed: string) => void;
  /** Number of options in the grid. Default 8 (two rows of four). */
  count?: number;
  /** Preview size. Default 112. */
  previewSize?: number;
  /** Compact layout for small surfaces (the extension popup). */
  compact?: boolean;
};

/**
 * Pick your avatar: a first question (girl / boy / anyone), a grid of looks to tap, Shuffle for new ones,
 * a skin tone row, and "Surprise me" for a random pick. The result is an `avatarSeed` string.
 */
export function AvatarPicker({ value, onChange, count = 8, previewSize = 112, compact }: AvatarPickerProps) {
  const [look, setLook] = useState<AvatarLook | null>(() => lookOf(value));
  const [skin, setSkin] = useState<number | null>(() => skinToneOf(value));
  const [options, setOptions] = useState<string[]>([]);

  // New options whenever the look changes; the current avatar stays first if it fits the look.
  useEffect(() => {
    if (!look) return;
    const fresh = avatarOptions(look, count, skin ?? undefined);
    setOptions(lookOf(value) === look ? [value, ...fresh.filter((s) => s !== value)].slice(0, count) : fresh);
    // Only when the look changes: `value` and `skin` changes update the grid in their own handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, count]);

  const chooseLook = (l: AvatarLook) => {
    setLook(l);
    if (lookOf(value) !== l) onChange(randomAvatar(l, skin ?? undefined));
  };
  const shuffle = () => {
    if (look) setOptions(avatarOptions(look, count, skin ?? undefined));
  };
  const surprise = () => {
    const l = look ?? "any";
    const seed = randomAvatar(l, skin ?? undefined);
    onChange(seed);
    if (look) setOptions((xs) => [seed, ...xs.filter((s) => s !== seed)].slice(0, count));
    else setLook(l);
  };
  const chooseSkin = (i: number) => {
    setSkin(i);
    setOptions((xs) => xs.map((s) => withSkinTone(s, i)));
    onChange(lookOf(value) ? withSkinTone(value, i) : randomAvatar(look ?? "any", i));
  };

  return (
    <div className={clsx(css.root, compact && css.compact)}>
      <img src={avatarUri(value)} alt="Your avatar" width={previewSize} height={previewSize} className={css.preview} />

      <div className={css.question}>
        <span className={css.label}>Who's singing?</span>
        <ChipRow className={css.looks}>
          {LOOK_LABELS.map(({ look: l, label }) => (
            <Chip key={l} selected={look === l} onClick={() => chooseLook(l)}>
              {label}
            </Chip>
          ))}
          <Chip icon={<Dices size={16} />} onClick={surprise}>
            Surprise me
          </Chip>
        </ChipRow>
      </div>

      {look && (
        <>
          <div className={css.grid} role="radiogroup" aria-label="Pick your avatar">
            {options.map((seed, i) => (
              <button
                key={seed}
                type="button"
                role="radio"
                aria-checked={seed === value}
                aria-label={`Avatar ${i + 1}`}
                className={clsx(css.option, seed === value && css.selected)}
                onClick={() => onChange(seed)}
              >
                <img src={avatarUri(seed)} alt="" draggable={false} />
              </button>
            ))}
          </div>

          <div className={css.row}>
            <div className={css.skins} role="radiogroup" aria-label="Skin tone">
              {SKIN_TONES.map((hex, i) => (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={skin === i}
                  aria-label={`Skin tone ${i + 1}`}
                  className={clsx(css.skin, skin === i && css.skinOn)}
                  style={{ background: `#${hex}` }}
                  onClick={() => chooseSkin(i)}
                />
              ))}
            </div>
            <button type="button" className={css.shuffle} onClick={shuffle}>
              <Shuffle size={16} />
              Shuffle
            </button>
          </div>
        </>
      )}
    </div>
  );
}
