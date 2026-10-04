import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/lib/intl';

const SAMPLE_DATE = new Date('2026-03-15T15:30:00Z');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Página de verificação do design system, dos temas e do i18n. */
export function Showcase() {
  const { t } = useTranslation();
  const { formatDate, formatNumber, formatPercent } = useFormatters();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="font-serif text-4xl font-semibold">{t('showcase.title')}</h1>
        <p className="text-muted-foreground">{t('showcase.intro')}</p>
      </header>

      <Section title={t('showcase.typography')}>
        <div className="space-y-2 rounded-xl border bg-surface p-6">
          <p className="font-serif text-2xl">{t('showcase.headingSample')}</p>
          <p>{t('showcase.bodySample')}</p>
          <p className="font-mono text-sm text-muted-foreground">{t('showcase.monoSample')}</p>
        </div>
      </Section>

      <Section title={t('showcase.buttons')}>
        <div className="flex flex-wrap gap-3">
          <Button>{t('showcase.buttonPrimary')}</Button>
          <Button variant="secondary">{t('showcase.buttonSecondary')}</Button>
          <Button variant="outline">{t('showcase.buttonOutline')}</Button>
          <Button variant="ghost">{t('showcase.buttonGhost')}</Button>
          <Button variant="destructive">{t('showcase.buttonDestructive')}</Button>
        </div>
      </Section>

      <Section title={t('showcase.intl')}>
        <dl className="grid gap-4 rounded-xl border bg-surface p-6 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">
              {t('showcase.lessonCount', { count: 1 })}
            </dt>
            <dd className="font-mono">{t('showcase.lessonCount', { count: 12 })}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('showcase.dateLabel')}</dt>
            <dd className="font-mono">{formatDate(SAMPLE_DATE)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('showcase.numberLabel')}</dt>
            <dd className="font-mono">{formatNumber(1234567.89)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t('showcase.percentLabel')}</dt>
            <dd className="font-mono">{formatPercent(0.68)}</dd>
          </div>
        </dl>
      </Section>

      <Section title={t('showcase.states')}>
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              {t('showcase.skeleton')}
            </h3>
            <PageSkeleton />
          </div>
          <div className="rounded-xl border bg-surface">
            <h3 className="px-6 pt-4 text-sm font-medium text-muted-foreground">
              {t('showcase.empty')}
            </h3>
            <EmptyState
              title={t('showcase.emptyTitle')}
              description={t('showcase.emptyDescription')}
              action={{ label: t('showcase.emptyAction') }}
            />
          </div>
          <div className="rounded-xl border bg-surface">
            <h3 className="px-6 pt-4 text-sm font-medium text-muted-foreground">
              {t('showcase.errorState')}
            </h3>
            <ErrorState onRetry={() => toast.info(t('actions.retry'))} />
          </div>
        </div>
      </Section>

      <Section title={t('showcase.feedback')}>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            {t('showcase.openConfirm')}
          </Button>
          <Button variant="secondary" onClick={() => toast.success(t('showcase.toastMessage'))}>
            {t('showcase.toastTrigger')}
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('showcase.confirmTitle')}
          description={t('showcase.confirmDescription')}
          confirmLabel={t('showcase.confirmAction')}
          onConfirm={() => toast.success(t('showcase.toastMessage'))}
        />
      </Section>
    </div>
  );
}
