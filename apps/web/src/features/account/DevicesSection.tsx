import type { SessionInfo } from '@opencourse/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRevokeSession, useSessions } from '@/hooks/queries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { describeUserAgent } from '@/lib/userAgent';

function DeviceRow({
  session,
  timeZone,
  onSignOut,
  disabled,
}: {
  session: SessionInfo;
  timeZone?: string;
  onSignOut: (session: SessionInfo) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('student');
  const { formatDateTime } = useFormatters(timeZone);
  const { browser, system } = describeUserAgent(session.userAgent);
  const name = [browser, system].filter(Boolean).join(' · ') || t('settings.devices.unknown');

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{name}</p>
          {session.current ? (
            <Badge variant="success">{t('settings.devices.current')}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.devices.lastUsed', { date: formatDateTime(new Date(session.lastUsedAt)) })}
          {session.ip ? ` · ${session.ip}` : ''}
        </p>
      </div>
      {/* the device in use signs out with the normal button: ending it here would strand the page */}
      {session.current ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSignOut(session)}
          aria-label={t('settings.devices.signOutDevice', { name })}
        >
          {t('settings.devices.signOut')}
        </Button>
      )}
    </li>
  );
}

/** Where the account is signed in, with a way to end the devices the student does not recognise. */
export function DevicesSection() {
  const { t } = useTranslation('student');
  const { user } = useAuth();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const describeError = useServiceErrorMessage();

  const signOutDevice = (session: SessionInfo) =>
    revoke.mutate(session.id, {
      onSuccess: () => toast.success(t('settings.devices.signedOutToast')),
      onError: (error) => toast.error(describeError(error)),
    });

  return (
    <Card className="p-5">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('settings.devices.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.devices.description')}</p>
        </div>
        {sessions.isError ? (
          <ErrorState
            title={t('settings.devices.errorTitle')}
            description={describeError(sessions.error)}
            onRetry={() => void sessions.refetch()}
          />
        ) : sessions.data ? (
          <ul className="divide-y rounded-lg border">
            {sessions.data.map((session) => (
              <DeviceRow
                key={session.id}
                session={session}
                {...(user?.timeZone ? { timeZone: user.timeZone } : {})}
                onSignOut={signOutDevice}
                disabled={revoke.isPending}
              />
            ))}
          </ul>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </div>
    </Card>
  );
}
