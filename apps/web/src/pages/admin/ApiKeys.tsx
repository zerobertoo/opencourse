import type { ApiKey } from '@opencourse/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiKeyFormDialog } from '@/features/admin/ApiKeyFormDialog';
import { ApiKeyTokenDialog } from '@/features/admin/ApiKeyTokenDialog';
import { useApiKeyMutations, useApiKeys } from '@/hooks/adminQueries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';

function ApiKeyRow({
  apiKey,
  timeZone,
  onRevoke,
}: {
  apiKey: ApiKey;
  timeZone?: string;
  onRevoke: (apiKey: ApiKey) => void;
}) {
  const { t } = useTranslation('admin');
  const { formatDate } = useFormatters(timeZone);
  const date = (iso: string) =>
    formatDate(new Date(iso), { dateStyle: 'short', timeStyle: 'short' });
  const revoked = apiKey.revokedAt !== null;

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-sm font-medium">{apiKey.name}</p>
        <Badge variant={revoked ? 'warning' : 'success'}>
          {revoked ? t('apiKeys.status.revoked') : t('apiKeys.status.active')}
        </Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {t('apiKeys.tokenPrefix', { prefix: `${apiKey.tokenPrefix}…` })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('apiKeys.createdAt', { date: date(apiKey.createdAt) })}
        {' · '}
        {apiKey.lastUsedAt
          ? t('apiKeys.lastUsed', { date: date(apiKey.lastUsedAt) })
          : t('apiKeys.neverUsed')}
        {apiKey.revokedAt ? ` · ${t('apiKeys.revokedAt', { date: date(apiKey.revokedAt) })}` : ''}
      </p>
      {revoked ? null : (
        <Button
          variant="outline"
          size="sm"
          aria-label={t('apiKeys.revokeFor', { name: apiKey.name })}
          onClick={() => onRevoke(apiKey)}
        >
          {t('apiKeys.revoke')}
        </Button>
      )}
    </li>
  );
}

type Dialogs =
  { kind: 'form' } | { kind: 'token'; token: string } | { kind: 'revoke'; apiKey: ApiKey } | null;

/** API keys for server-side plugins: list, create (token shown once) and revoke. */
export function AdminApiKeys() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useAuth();
  const query = useApiKeys();
  const { revoke } = useApiKeyMutations();
  const describeError = useServiceErrorMessage();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('admin:apiKeys.emptyTitle')}
        description={t('admin:apiKeys.emptyDescription')}
        action={{ label: t('admin:apiKeys.add'), onClick: () => setDialog({ kind: 'form' }) }}
      />
    );
  } else {
    body = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('admin:apiKeys.listLabel')}
      >
        {query.data.map((apiKey) => (
          <ApiKeyRow
            key={apiKey.id}
            apiKey={apiKey}
            {...(user?.timeZone ? { timeZone: user.timeZone } : {})}
            onRevoke={(target) => setDialog({ kind: 'revoke', apiKey: target })}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="admin-api-keys-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="admin-api-keys-heading" className="text-xl font-semibold">
            {t('admin:apiKeys.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('admin:apiKeys.description')}</p>
        </div>
        <Button onClick={() => setDialog({ kind: 'form' })}>
          <Plus aria-hidden="true" />
          {t('admin:apiKeys.add')}
        </Button>
      </div>

      {body}

      {dialog?.kind === 'form' ? (
        <ApiKeyFormDialog
          onClose={close}
          onCreated={(created) => setDialog({ kind: 'token', token: created.token })}
        />
      ) : null}
      {dialog?.kind === 'token' ? <ApiKeyTokenDialog token={dialog.token} onClose={close} /> : null}
      <ConfirmDialog
        open={dialog?.kind === 'revoke'}
        onOpenChange={(open) => !open && close()}
        title={t('admin:apiKeys.revokeDialog.title')}
        description={t('admin:apiKeys.revokeDialog.description', {
          name: dialog?.kind === 'revoke' ? dialog.apiKey.name : '',
        })}
        confirmLabel={t('admin:apiKeys.revokeDialog.confirm')}
        onConfirm={() => {
          if (dialog?.kind !== 'revoke') return;
          void (async () => {
            try {
              await revoke.mutateAsync(dialog.apiKey.id);
              toast.success(t('admin:apiKeys.revokedToast'));
            } catch (error) {
              toast.error(describeError(error));
            }
          })();
        }}
      />
    </section>
  );
}
