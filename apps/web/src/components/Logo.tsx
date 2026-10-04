import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlatformSettings } from '@/hooks/adminQueries';

/** Platform logo and name, taken from the instance branding (placeholders until configured). */
export function Logo({ showName = true }: { showName?: boolean }) {
  const { t } = useTranslation();
  const { data } = usePlatformSettings();
  const name = data?.brand.name ?? t('app.name');
  const logoUrl = data?.brand.logoUrl;

  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-lg font-semibold">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          aria-hidden="true"
          className="size-8 rounded-lg object-contain"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BookOpen className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className={showName ? 'truncate' : 'sr-only'}>{name}</span>
    </span>
  );
}
