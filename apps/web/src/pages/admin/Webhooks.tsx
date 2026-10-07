import type { WebhookEndpoint } from '@opencourse/shared';
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
import { WebhookDeliveriesDialog } from '@/features/admin/WebhookDeliveriesDialog';
import { WebhookFormDialog } from '@/features/admin/WebhookFormDialog';
import { WebhookSecretDialog } from '@/features/admin/WebhookSecretDialog';
import { useWebhookMutations, useWebhooks } from '@/hooks/adminQueries';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { webhookEventKey } from '@/lib/webhookEvents';

interface RowActions {
  onEdit: (webhook: WebhookEndpoint) => void;
  onTest: (webhook: WebhookEndpoint) => void;
  onHistory: (webhook: WebhookEndpoint) => void;
  onRotate: (webhook: WebhookEndpoint) => void;
  onToggle: (webhook: WebhookEndpoint) => void;
  onDelete: (webhook: WebhookEndpoint) => void;
}

function WebhookRow({ webhook, actions }: { webhook: WebhookEndpoint; actions: RowActions }) {
  const { t } = useTranslation('admin');
  const label = (
    key:
      | 'webhooks.editFor'
      | 'webhooks.testFor'
      | 'webhooks.historyFor'
      | 'webhooks.rotateFor'
      | 'webhooks.enableFor'
      | 'webhooks.disableFor'
      | 'webhooks.deleteFor',
  ) => t(key, { url: webhook.url });

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-all font-mono text-sm font-medium">{webhook.url}</p>
        <Badge variant={webhook.active ? 'success' : 'warning'}>
          {webhook.active ? t('webhooks.status.active') : t('webhooks.status.inactive')}
        </Badge>
      </div>
      {webhook.description ? (
        <p className="text-sm text-muted-foreground">{webhook.description}</p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5" aria-label={t('webhooks.form.events')}>
        {webhook.events.map((name) => (
          <li key={name}>
            <Badge>{t(`webhooks.events.${webhookEventKey(name)}`)}</Badge>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-label={label('webhooks.editFor')}
          onClick={() => actions.onEdit(webhook)}
        >
          {t('webhooks.edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={label('webhooks.testFor')}
          onClick={() => actions.onTest(webhook)}
        >
          {t('webhooks.test')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={label('webhooks.historyFor')}
          onClick={() => actions.onHistory(webhook)}
        >
          {t('webhooks.history')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={label('webhooks.rotateFor')}
          onClick={() => actions.onRotate(webhook)}
        >
          {t('webhooks.rotate')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={label(webhook.active ? 'webhooks.disableFor' : 'webhooks.enableFor')}
          onClick={() => actions.onToggle(webhook)}
        >
          {webhook.active ? t('webhooks.disable') : t('webhooks.enable')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label={label('webhooks.deleteFor')}
          onClick={() => actions.onDelete(webhook)}
        >
          {t('webhooks.delete')}
        </Button>
      </div>
    </li>
  );
}

type Dialogs =
  | { kind: 'form'; webhook: WebhookEndpoint | null }
  | { kind: 'secret'; secret: string }
  | { kind: 'history'; webhook: WebhookEndpoint }
  | { kind: 'rotate'; webhook: WebhookEndpoint }
  | { kind: 'delete'; webhook: WebhookEndpoint }
  | null;

/** Outbound webhooks: endpoints, their one-time secrets, tests and delivery history. */
export function AdminWebhooks() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useAuth();
  const query = useWebhooks();
  const { update, remove, rotateSecret, sendTest } = useWebhookMutations();
  const describeError = useServiceErrorMessage();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const actions: RowActions = {
    onEdit: (webhook) => setDialog({ kind: 'form', webhook }),
    onHistory: (webhook) => setDialog({ kind: 'history', webhook }),
    onRotate: (webhook) => setDialog({ kind: 'rotate', webhook }),
    onDelete: (webhook) => setDialog({ kind: 'delete', webhook }),
    onTest: (webhook) =>
      void run(async () => {
        const result = await sendTest.mutateAsync(webhook.id);
        if (result.succeeded) {
          toast.success(t('admin:webhooks.testSuccess', { status: result.statusCode }));
        } else {
          toast.error(t('admin:webhooks.testFailure', { error: result.error ?? '' }));
        }
      }),
    onToggle: (webhook) =>
      void run(async () => {
        await update.mutateAsync({ id: webhook.id, patch: { active: !webhook.active } });
        toast.success(
          t(webhook.active ? 'admin:webhooks.disabledToast' : 'admin:webhooks.enabledToast'),
        );
      }),
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('admin:webhooks.emptyTitle')}
        description={t('admin:webhooks.emptyDescription')}
        action={{
          label: t('admin:webhooks.add'),
          onClick: () => setDialog({ kind: 'form', webhook: null }),
        }}
      />
    );
  } else {
    body = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('admin:webhooks.listLabel')}
      >
        {query.data.map((webhook) => (
          <WebhookRow key={webhook.id} webhook={webhook} actions={actions} />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="admin-webhooks-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="admin-webhooks-heading" className="text-xl font-semibold">
            {t('admin:webhooks.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('admin:webhooks.description')}</p>
        </div>
        <Button onClick={() => setDialog({ kind: 'form', webhook: null })}>
          <Plus aria-hidden="true" />
          {t('admin:webhooks.add')}
        </Button>
      </div>

      {body}

      {dialog?.kind === 'form' ? (
        <WebhookFormDialog
          key={dialog.webhook?.id ?? 'new'}
          webhook={dialog.webhook}
          onClose={close}
          onCreated={(created) => setDialog({ kind: 'secret', secret: created.secret })}
        />
      ) : null}
      {dialog?.kind === 'secret' ? (
        <WebhookSecretDialog secret={dialog.secret} onClose={close} />
      ) : null}
      {dialog?.kind === 'history' ? (
        <WebhookDeliveriesDialog
          webhook={dialog.webhook}
          {...(user?.timeZone ? { timeZone: user.timeZone } : {})}
          onClose={close}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'rotate'}
        onOpenChange={(open) => !open && close()}
        title={t('admin:webhooks.rotateDialog.title')}
        description={t('admin:webhooks.rotateDialog.description')}
        confirmLabel={t('admin:webhooks.rotateDialog.confirm')}
        destructive={false}
        onConfirm={() => {
          if (dialog?.kind !== 'rotate') return;
          void run(async () => {
            const rotated = await rotateSecret.mutateAsync(dialog.webhook.id);
            setDialog({ kind: 'secret', secret: rotated.secret });
          });
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && close()}
        title={t('admin:webhooks.deleteDialog.title')}
        description={t('admin:webhooks.deleteDialog.description', {
          url: dialog?.kind === 'delete' ? dialog.webhook.url : '',
        })}
        confirmLabel={t('admin:webhooks.deleteDialog.confirm')}
        onConfirm={() => {
          if (dialog?.kind !== 'delete') return;
          void run(async () => {
            await remove.mutateAsync(dialog.webhook.id);
            toast.success(t('admin:webhooks.deletedToast'));
          });
        }}
      />
    </section>
  );
}
