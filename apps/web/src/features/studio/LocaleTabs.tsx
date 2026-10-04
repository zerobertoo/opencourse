import type { Locale } from '@opencourse/shared';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LocaleTabsProps {
  locales: readonly Locale[];
  value: Locale;
  onValueChange: (locale: Locale) => void;
  /** Languages whose content is still incomplete; they get a warning marker. */
  incomplete?: ReadonlySet<Locale>;
  /** Accessible name of the tab list. */
  label: string;
  /** Renders the fields of the selected language. */
  children: (locale: Locale) => React.ReactNode;
}

/** Language tabs for editing content per language, flagging incomplete translations. */
export function LocaleTabs({
  locales,
  value,
  onValueChange,
  incomplete,
  label,
  children,
}: LocaleTabsProps) {
  const { t } = useTranslation(['studio', 'common']);

  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as Locale)}>
      <TabsList aria-label={label}>
        {locales.map((locale) => (
          <TabsTrigger key={locale} value={locale} className="inline-flex items-center gap-1.5">
            {t(`common:language.${locale}`)}
            {incomplete?.has(locale) ? (
              <>
                <AlertTriangle className="size-3.5 text-destructive" aria-hidden="true" />
                <span className="sr-only">{t('studio:translation.incompleteMarker')}</span>
              </>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={value}>{children(value)}</TabsContent>
    </Tabs>
  );
}
