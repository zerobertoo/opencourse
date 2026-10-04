import { SUPPORTED_LOCALES } from '@opencourse/shared';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Interface language selector; switching happens without reloading the page. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('language.label')}</span>
      <Languages
        className="pointer-events-none absolute start-2.5 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="h-10 appearance-none rounded-md border bg-surface ps-8 pe-3 text-sm text-surface-foreground"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
