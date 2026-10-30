import { SUPPORTED_LOCALES } from '@opencourse/shared';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';

/** Interface language selector; switching happens without reloading the page. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className="relative inline-flex items-center">
      <Languages
        className="pointer-events-none absolute start-2.5 z-10 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Select
        aria-label={t('language.label')}
        value={i18n.resolvedLanguage ?? ''}
        onValueChange={(locale) => void i18n.changeLanguage(locale)}
        className="w-auto ps-8"
        options={SUPPORTED_LOCALES.map((locale) => ({
          value: locale,
          label: t(`language.${locale}`),
        }))}
      />
    </div>
  );
}
