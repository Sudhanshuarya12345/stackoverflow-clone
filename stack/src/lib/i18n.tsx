import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { dictionaries, LanguageCode, LANGUAGES, TranslationKey } from "@/locales";
import { useAuth } from "./AuthContext";

type Vars = Record<string, string | number | undefined>;

let currentLanguage: LanguageCode = "en";

const interpolate = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? `{${name}}` : String(vars[name]))) : text;

// Usable outside React components (e.g. toasts in AuthContext). Falls back to English, then to the key.
export const translate = (key: TranslationKey | string, vars?: Vars, language: LanguageCode = currentLanguage) => {
  const dict = dictionaries[language] as Record<string, string>;
  const english = dictionaries.en as Record<string, string>;
  return interpolate(dict[key] ?? english[key] ?? key, vars);
};

const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.some((l) => l.code === value);

type I18nValue = {
  language: LanguageCode;
  t: (key: TranslationKey, vars?: Vars) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | number | Date) => string;
};

const I18nContext = createContext<I18nValue>({
  language: "en",
  t: (key, vars) => translate(key, vars, "en"),
  formatDate: (value) => new Date(value).toLocaleDateString("en"),
  formatDateTime: (value) => new Date(value).toLocaleString("en"),
});

const LOCALE_TAGS: Record<LanguageCode, string> = {
  en: "en-US",
  es: "es-ES",
  hi: "hi-IN",
  pt: "pt-BR",
  zh: "zh-CN",
  fr: "fr-FR",
};

// The active language comes from the verified preference stored on the user's account.
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const language: LanguageCode = isLanguage(user?.language) ? user.language : "en";
  currentLanguage = language;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key: TranslationKey, vars?: Vars) => translate(key, vars, language), [language]);
  const formatDate = useCallback(
    (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      new Date(value).toLocaleDateString(LOCALE_TAGS[language], options),
    [language]
  );
  const formatDateTime = useCallback(
    (value: string | number | Date) => new Date(value).toLocaleString(LOCALE_TAGS[language]),
    [language]
  );
  const value = useMemo(() => ({ language, t, formatDate, formatDateTime }), [language, t, formatDate, formatDateTime]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
