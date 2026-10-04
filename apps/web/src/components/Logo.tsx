import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Logo e nome da plataforma (placeholders). */
export function Logo({ showName = true }: { showName?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2 font-serif text-lg font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="size-4" aria-hidden="true" />
      </span>
      <span className={showName ? undefined : 'sr-only'}>{t('app.name')}</span>
    </span>
  );
}
