import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@opencourse/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, resources } from './resources';

export const LANGUAGE_STORAGE_KEY = 'opencourse.language';

/** Mantém o atributo `lang` do documento sincronizado com o idioma ativo. */
function syncDocumentLanguage(language: string) {
  document.documentElement.lang = language;
}

void i18n
  .use(ICU)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    load: 'currentOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

syncDocumentLanguage(i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
