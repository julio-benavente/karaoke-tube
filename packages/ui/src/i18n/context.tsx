import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANG_STORAGE_KEY, detectLang, makeT, type Lang, type TFn } from "./core";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: TFn };
const I18nContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: makeT("en") });

/** Provides the language (saved `kt:lang`, else the browser's, else English) to the tree below. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t: makeT(lang) }), [lang, setLang]);
  return createElement(I18nContext.Provider, { value }, children);
}

/**
 * A session has one language, chosen when the party is created: inside a room every screen uses it instead of the
 * device's own. `lang` undefined (not known yet, or outside a room) leaves the device's language in charge.
 * `onChange` is what the language switcher does in there (the host changes the whole session; others can't).
 */
export function SessionLanguage({ lang, onChange, children }: { lang: Lang | undefined; onChange?: (l: Lang) => void; children: ReactNode }) {
  const parent = useContext(I18nContext);
  const value = useMemo(
    () => (lang ? { lang, setLang: onChange ?? (() => {}), t: makeT(lang) } : parent),
    [lang, onChange, parent],
  );
  useEffect(() => {
    if (!lang) return;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = parent.lang;
    };
  }, [lang, parent.lang]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useT(): TFn {
  return useContext(I18nContext).t;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useContext(I18nContext);
  return [lang, setLang];
}
