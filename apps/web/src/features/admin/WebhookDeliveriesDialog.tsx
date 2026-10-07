import type { WebhookDelivery, WebhookEndpoint } from '@opencourse/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebhookDeliveries, useWebhookMutations } from '@/hooks/adminQueries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { webhookEventKey } from '@/lib/webhookEvents';

function DeliveryRow({ delivery, timeZone }: { delivery: WebhookDelivery; timeZone?: string }) {
  const { t } = useTranslation('admin');
  const { formatDate } = useFormatters(timeZone);
  const { retryDelivery } = useWebhookMutations();
  const describeError = useServiceErrorMessage();
  const eventLabel = t(`webhooks.events.${webhookEventKey(delivery.eventName)}`);

  const retry = async () => {
    try {
      await retryDelivery.mutateAsync(delivery.id);
      toast.success(t('webhooks.deliveries.retriedToast'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <li className="space-y-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={delivery.status === 'failed' ? 'warning' : 'neutral'}>
          {t(`webhooks.deliveries.status.${delivery.status}`)}
        </Badge>
        <span className="text-sm font-medium">{eventLabel}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(new Date(delivery.createdAt), { dateStyle: 'short', timeStyle: 'medium' })}
        </span>
        {delivery.status === 'failed' ? (
          <Button
            size="sm"
            variant="outline"
            className="ms-auto"
            disabled={retryDelivery.isPending}
            aria-label={t('webhooks.deliveries.retryFor', { event: eventLabel })}
            onClick={() => void retry()}
          >
            {t('webhooks.deliveries.retry')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('webhooks.deliveries.attempts', { count: delivery.attempts })}
        {delivery.lastStatusCode === null
          ? ''
          : ` · ${t('webhooks.deliveries.statusCode', { code: delivery.lastStatusCode })}`}
        {delivery.lastError ? ` · ${delivery.lastError}` : ''}
      </p>
    </li>
  );
}

/** Delivery history of one webhook, with a retry for the ones that failed. */
export function WebhookDeliveriesDialog({
  webhook,
  timeZone,
  onClose,
}: {
  webhook: WebhookEndpoint;
  timeZone?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const query = useWebhookDeliveries(webhook.id);

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('admin:webhooks.deliveries.emptyTitle')}
        description={t('admin:webhooks.deliveries.emptyDescription')}
      />
    );
  } else {
    body = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('admin:webhooks.deliveries.listLabel')}
      >
        {query.data.map((delivery) => (
          <DeliveryRow key={delivery.id} delivery={delivery} {...(timeZone ? { timeZone } : {})} />
        ))}
      </ul>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{t('admin:webhooks.deliveries.title')}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs break-all">{webhook.url}</span>
          <br />
          {t('admin:webhooks.deliveries.description')}
        </DialogDescription>
        <div className="mt-4">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
