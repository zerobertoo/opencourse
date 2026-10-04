import { AlertTriangle, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface StateAction {
  label: string;
  onClick?: () => void;
}

interface StateProps {
  title: string;
  description?: string;
  action?: StateAction;
  children?: React.ReactNode;
}

function StateFrame({
  icon,
  title,
  description,
  action,
  children,
}: StateProps & { icon: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
      {children}
    </div>
  );
}

/** Empty state with a call to action. */
export function EmptyState(props: StateProps) {
  return <StateFrame icon={<Inbox className="size-6" aria-hidden="true" />} {...props} />;
}

/** Error state with a "try again" button. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
}: {
  title?: string;
  description?: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert">
      <StateFrame
        icon={<AlertTriangle className="size-6" aria-hidden="true" />}
        title={title ?? t('states.error.title')}
        description={description ?? t('states.error.description')}
        action={{ label: retryLabel ?? t('actions.retry'), onClick: onRetry }}
      />
    </div>
  );
}

/** Full-page loading skeleton. */
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{t('states.loading')}</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
