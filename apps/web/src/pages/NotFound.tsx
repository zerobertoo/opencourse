import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';

/** 404 screen. */
export function NotFound() {
  const { t } = useTranslation(['errors', 'common']);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <EmptyState title={t('errors:notFound.title')} description={t('errors:notFound.description')}>
        <Button asChild variant="outline">
          <Link to="/">{t('common:actions.goHome')}</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
