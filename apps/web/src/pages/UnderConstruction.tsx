import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/StateViews';

/** Placeholder para áreas que serão construídas nas próximas etapas. */
export function UnderConstruction({
  titleKey,
}: {
  titleKey: 'studio:dashboard.title' | 'admin:dashboard.title';
}) {
  const { t } = useTranslation(['common', 'studio', 'admin']);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">{t(titleKey)}</h1>
      <EmptyState
        title={t('common:states.underConstruction.title')}
        description={t('common:states.underConstruction.description')}
      />
    </div>
  );
}
