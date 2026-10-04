import type { FileAttachment } from '@opencourse/shared';
import { Download, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/StateViews';
import { formatFileSize } from '@/lib/fileSize';

/** Downloadable files attached to a lesson. */
export function AttachmentList({ attachments }: { attachments: FileAttachment[] }) {
  const { t, i18n } = useTranslation('player');

  if (attachments.length === 0) {
    return (
      <EmptyState title={t('materials.emptyTitle')} description={t('materials.emptyDescription')} />
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-surface">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-center gap-3 p-3 sm:p-4">
          <Paperclip className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{attachment.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatFileSize(attachment.sizeBytes, i18n.language)}
            </p>
          </div>
          <a
            href={attachment.url}
            download={attachment.name}
            aria-label={t('materials.downloadFile', { name: attachment.name })}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border bg-surface px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('materials.download')}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
