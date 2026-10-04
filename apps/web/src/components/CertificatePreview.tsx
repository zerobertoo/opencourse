import { Award } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface CertificatePreviewProps {
  holderName: string;
  courseTitle: string;
  issuedOn: string;
  code: string;
  /** Optional custom message from the course certificate template. */
  message?: string;
  signatoryName?: string;
  signatoryRole?: string;
  className?: string;
}

/** Visual preview of a certificate (the downloadable PDF mirrors this content). */
export function CertificatePreview({
  holderName,
  courseTitle,
  issuedOn,
  code,
  message,
  signatoryName,
  signatoryRole,
  className,
}: CertificatePreviewProps) {
  const { t } = useTranslation('student');
  return (
    <div className={cn('rounded-lg border-2 border-primary/60 bg-background p-1.5', className)}>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded border border-primary/30 px-4 py-6 text-center">
        <Award className="size-7 text-primary" aria-hidden="true" />
        <p className="font-serif text-lg font-semibold">{t('certificates.heading')}</p>
        <p className="text-xs text-muted-foreground">{t('certificates.intro')}</p>
        <p className="font-serif text-xl font-semibold">{holderName}</p>
        <p className="text-xs text-muted-foreground">{t('certificates.completion')}</p>
        <p className="font-serif text-base font-semibold leading-snug">{courseTitle}</p>
        {message ? <p className="max-w-prose text-xs italic">{message}</p> : null}
        {signatoryName ? (
          <p className="mt-2 text-xs">
            <span className="block font-serif text-sm font-semibold">{signatoryName}</span>
            {signatoryRole ? (
              <span className="block text-muted-foreground">{signatoryRole}</span>
            ) : null}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {t('certificates.issuedOn', { date: issuedOn })}
        </p>
        <p className="font-mono text-xs">{t('certificates.code', { code })}</p>
      </div>
    </div>
  );
}
