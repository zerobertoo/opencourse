import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';

/** Friendly 403 screen. */
export function Forbidden() {
  const { t } = useTranslation(['errors', 'common']);
  return (
    <EmptyState title={t('errors:forbidden.title')} description={t('errors:forbidden.description')}>
      <Button asChild variant="outline">
        <Link to="/">{t('common:actions.goHome')}</Link>
      </Button>
    </EmptyState>
  );
}
