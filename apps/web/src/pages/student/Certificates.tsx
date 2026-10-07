import { pickCertificateTitle } from '@opencourse/shared';
import { Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CertificatePreview } from '@/components/CertificatePreview';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyCertificates } from '@/hooks/queries';
import { buildCertificatePdf } from '@/lib/certificatePdf';
import { toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import type { CertificateDetails } from '@/services';

/** My certificates: list with preview and (mocked) PDF download. */
export function Certificates() {
  const { t, i18n } = useTranslation(['student', 'common']);
  // UTC like the public page, so the same certificate shows the same day everywhere
  const { formatDate } = useFormatters('UTC');
  const query = useMyCertificates();
  const [previewing, setPreviewing] = useState<CertificateDetails | null>(null);
  const locale = toLocale(i18n.resolvedLanguage);

  const issuedOn = (certificate: CertificateDetails) => formatDate(new Date(certificate.issuedAt));

  const download = (certificate: CertificateDetails) => {
    const courseTitle = pickCertificateTitle(certificate, locale);
    const template = certificate.template;
    const blob = buildCertificatePdf({
      heading: t('certificates.heading'),
      intro: t('certificates.intro'),
      holderName: certificate.holderName,
      completion: t('certificates.completion'),
      courseTitle,
      issuedLine: t('certificates.issuedOn', { date: issuedOn(certificate) }),
      codeLine: t('certificates.code', { code: certificate.code }),
      message: template.message || undefined,
      signatoryLine:
        [template.signatoryName, template.signatoryRole].filter(Boolean).join(', ') || undefined,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${certificate.code}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('certificates.downloadStarted'));
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('certificates.emptyTitle')}
        description={t('certificates.emptyDescription')}
      >
        <Button asChild>
          <Link to="/">{t('certificates.emptyAction')}</Link>
        </Button>
      </EmptyState>
    );
  } else {
    body = (
      <ul className="grid gap-4 md:grid-cols-2">
        {query.data.map((certificate) => {
          const courseTitle = pickCertificateTitle(certificate, locale);
          return (
            <li key={certificate.id} className="min-w-0">
              <Card className="flex h-full flex-col gap-4 p-4">
                <CertificatePreview
                  holderName={certificate.holderName}
                  courseTitle={courseTitle}
                  issuedOn={issuedOn(certificate)}
                  code={certificate.code}
                  message={certificate.template.message}
                  signatoryName={certificate.template.signatoryName}
                  signatoryRole={certificate.template.signatoryRole}
                />
                <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="flex-1"
                    aria-label={t('certificates.previewFor', { title: courseTitle })}
                    onClick={() => setPreviewing(certificate)}
                  >
                    <Eye aria-hidden="true" />
                    {t('certificates.preview')}
                  </Button>
                  <Button
                    className="flex-1"
                    aria-label={t('certificates.downloadFor', { title: courseTitle })}
                    onClick={() => download(certificate)}
                  >
                    <Download aria-hidden="true" />
                    {t('certificates.download')}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('certificates.title')}</h1>
        <p className="text-muted-foreground">{t('certificates.subtitle')}</p>
      </div>
      {body}

      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent>
          {previewing ? (
            <>
              <DialogTitle>{t('certificates.dialogTitle')}</DialogTitle>
              <DialogDescription>{t('certificates.dialogDescription')}</DialogDescription>
              <CertificatePreview
                className="mt-4"
                holderName={previewing.holderName}
                courseTitle={pickCertificateTitle(previewing, locale)}
                issuedOn={issuedOn(previewing)}
                code={previewing.code}
                message={previewing.template.message}
                signatoryName={previewing.template.signatoryName}
                signatoryRole={previewing.template.signatoryRole}
              />
              <Button className="mt-4 w-full sm:w-auto" onClick={() => download(previewing)}>
                <Download aria-hidden="true" />
                {t('certificates.download')}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
