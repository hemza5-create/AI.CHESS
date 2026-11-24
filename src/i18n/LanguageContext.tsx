import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getLanguageMeta,
  TRANSLATIONS,
  type LanguageMeta,
  type SupportedLanguage,
  type TranslationDictionary,
} from './translations.ts';

export const LANGUAGE_STORAGE_KEY = 'chess_vision_language';

const VALID_LANGUAGES = new Set<SupportedLanguage>(['ar', 'en', 'ru', 'zh', 'fr']);

export function getStoredLanguage(): SupportedLanguage {
  try {
    const raw = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    if (raw && VALID_LANGUAGES.has(raw as SupportedLanguage)) {
      return raw as SupportedLanguage;
    }
  } catch {
    // ignore restricted storage contexts
  }
  return 'ar';
}

export function saveStoredLanguage(lang: SupportedLanguage): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore restricted storage contexts
  }
}

interface LanguageContextValue {
  language: SupportedLanguage;
  meta: LanguageMeta;
  t: TranslationDictionary;
  setLanguage: (lang: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => getStoredLanguage());

  const setLanguage = useCallback((nextLang: SupportedLanguage) => {
    if (!VALID_LANGUAGES.has(nextLang)) return;
    setLanguageState(nextLang);
    saveStoredLanguage(nextLang);
  }, []);

  const meta = useMemo(() => getLanguageMeta(language), [language]);
  const t = useMemo(() => TRANSLATIONS[language], [language]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = meta.dir;
      document.title = t.appTitle;
    }
  }, [language, meta.dir, t.appTitle]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      meta,
      t,
      setLanguage,
    }),
    [language, meta, t, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
