import { SUPPORTED_LOCALES } from '@opencourse/shared';
import { ChevronDown, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/input';

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
      <Select
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="w-auto appearance-none ps-8 pe-8"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </Select>
      <ChevronDown
        className="pointer-events-none absolute end-2.5 size-4 text-muted-foreground"
        aria-hidden="true"
      />
    </label>
  );
}
