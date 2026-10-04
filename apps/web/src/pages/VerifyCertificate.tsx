import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { CertificatePreview } from '@/components/CertificatePreview';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVerifyCertificate } from '@/hooks/queries';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';

/** Public page that confirms a certificate is authentic from its verification code. */
export function VerifyCertificate() {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { code = '' } = useParams();
  const { formatDate } = useFormatters();
  const query = useVerifyCertificate(code);
  const locale = toLocale(i18n.resolvedLanguage);

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-72" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data === null) {
    body = (
      <EmptyState title={t('verify.invalidTitle')} description={t('verify.invalidDescription')}>
        <Button asChild variant="outline">
          <Link to="/">{t('verify.home')}</Link>
        </Button>
      </EmptyState>
    );
  } else {
    const certificate = query.data;
    const template = certificate.course.certificateTemplate;
    body = (
      <div className="space-y-4">
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
          {t('verify.valid')}
        </p>
        <CertificatePreview
          holderName={certificate.holderName}
          courseTitle={localizeCourse(certificate.course, locale).title}
          issuedOn={formatDate(new Date(certificate.issuedAt))}
          code={certificate.code}
          message={template.message}
          signatoryName={template.signatoryName}
          signatoryRole={template.signatoryRole}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{t('verify.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('verify.subtitle', { code })}</p>
      </div>
      {body}
    </div>
  );
}
