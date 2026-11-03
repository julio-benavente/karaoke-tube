// Pure i18n helpers (no React), safe to use inside shadow roots and plain scripts.
import { en } from "./en";
import { es, type Dict } from "./es";

export type Lang = "en" | "es";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];
export const LANG_STORAGE_KEY = "kt:lang";

type Raw = keyof Dict;
/** Keys you pass to `t`: plural keys are addressed without their `_one` / `_other` suffix. */
export type TKey = Raw extends infer K ? (K extends `${infer B}_${"one" | "other"}` ? B : K) : never;
export type Vars = Record<string, string | number>;
export type TFn = (key: TKey, vars?: Vars) => string;

const DICTS: Record<Lang, Record<string, string>> = { en, es };

export function isLang(x: unknown): x is Lang {
  return x === "en" || x === "es";
}

/** Saved choice (`kt:lang`) → browser language → English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // storage unavailable
  }
  try {
    if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")) return "es";
  } catch {
    // ignore
  }
  return "en";
}

const rules: Partial<Record<Lang, Intl.PluralRules>> = {};

/** Look up `key`; `{name}` placeholders come from `vars`; plurals use `count` with `_one` / `_other` keys. */
export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  const dict = DICTS[lang];
  let raw: string | undefined;
  if (vars && typeof vars.count === "number") {
    const r = (rules[lang] ??= new Intl.PluralRules(lang));
    const cat = r.select(vars.count) === "one" ? "one" : "other";
    raw = dict[`${key}_${cat}`] ?? dict[`${key}_other`];
  }
  raw ??= dict[key] ?? en[key as keyof typeof en] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}

/** A `t` bound to one language, for code outside React (TV overlays, formatters). */
export function makeT(lang: Lang): TFn {
  return (key, vars) => translate(lang, key, vars);
}
