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

export function useT(): TFn {
  return useContext(I18nContext).t;
}

export function useLang(): [Lang, (l: Lang) => void] {
  const { lang, setLang } = useContext(I18nContext);
  return [lang, setLang];
}
