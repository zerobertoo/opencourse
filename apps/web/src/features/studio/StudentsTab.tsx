import type { CourseDetail } from '@opencourse/shared';
import { Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseInvites, useCourseStudents, useGrantMutations } from '@/hooks/studioQueries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';
import type { CourseStudent } from '@/services';
import { GrantAccessDialog, InviteDialog } from './GrantDialogs';

function StudentRow({
  entry,
  timeZone,
  onRevoke,
}: {
  entry: CourseStudent;
  timeZone?: string;
  onRevoke: (entry: CourseStudent) => void;
}) {
  const { t } = useTranslation('studio');
  const { formatDate, formatPercent } = useFormatters(timeZone);
  const { user, grant, progress, lastActivityAt } = entry;

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={grant.status === 'active' ? 'success' : 'neutral'}>
            {t(`students.status.${grant.status}`)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t(`students.source.${grant.source}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {grant.expiresAt
            ? t('students.accessUntil', { date: formatDate(new Date(grant.expiresAt)) })
            : t('students.lifetime')}
        </p>
      </div>
      <div className="space-y-1.5">
        <ProgressBar
          value={progress.percent}
          label={t('students.progressLabel', { name: user.name })}
        />
        <p className="font-mono text-xs text-muted-foreground">
          {t('students.lessonsCompleted', {
            completed: progress.completedCount,
            total: progress.totalCount,
          })}{' '}
          · {formatPercent(progress.percent)}
        </p>
        <p className="text-xs text-muted-foreground">
          {lastActivityAt
            ? t('students.lastActivity', { date: formatDate(new Date(lastActivityAt)) })
            : t('students.noActivity')}
        </p>
      </div>
      <div className="md:justify-self-end">
        {grant.status === 'active' ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={t('students.revokeFor', { name: user.name })}
            onClick={() => onRevoke(entry)}
          >
            {t('students.revoke')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function InvitesSection({ courseId, timeZone }: { courseId: string; timeZone?: string }) {
  const { t } = useTranslation(['studio', 'common']);
  const { formatDate } = useFormatters(timeZone);
  const query = useCourseInvites(courseId);

  if (query.isPending) return <Skeleton className="h-16" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studio:students.invites.empty')}</p>;
  }
  return (
    <ul className="divide-y rounded-xl border bg-surface">
      {query.data.map((invite) => (
        <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{invite.email}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={invite.status === 'accepted' ? 'success' : 'neutral'}>
              {t(`studio:students.invites.status.${invite.status}`)}
            </Badge>
            {t('studio:students.invites.expires', { date: formatDate(new Date(invite.expiresAt)) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Students tab: who has access and how far they got, plus granting access and inviting. */
export function StudentsTab({ course }: { course: CourseDetail }) {
  const { t } = useTranslation(['studio', 'common']);
  const { user } = useAuth();
  const query = useCourseStudents(course.id);
  const { revokeGrant } = useGrantMutations(course.id);
  const describeError = useServiceErrorMessage();
  const [granting, setGranting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<CourseStudent | null>(null);

  const revoke = async () => {
    if (!revoking) return;
    try {
      await revokeGrant.mutateAsync(revoking.grant.id);
      toast.success(t('studio:students.revokedToast', { name: revoking.user.name }));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  let list: React.ReactNode;
  if (query.isPending) {
    list = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (query.isError) {
    list = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    list = (
      <EmptyState
        title={t('studio:students.emptyTitle')}
        description={t('studio:students.emptyDescription')}
        action={{ label: t('studio:students.grantAccess'), onClick: () => setGranting(true) }}
      />
    );
  } else {
    list = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('studio:students.listLabel')}
      >
        {query.data.map((entry) => (
          <StudentRow
            key={entry.user.id}
            entry={entry}
            timeZone={user?.timeZone}
            onRevoke={setRevoking}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="students-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="students-heading" className="text-xl font-semibold">
            {t('studio:students.title')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setGranting(true)}>
              <UserPlus aria-hidden="true" />
              {t('studio:students.grantAccess')}
            </Button>
            <Button variant="outline" onClick={() => setInviting(true)}>
              <Mail aria-hidden="true" />
              {t('studio:students.inviteStudent')}
            </Button>
          </div>
        </div>
        {list}
      </section>

      <section aria-labelledby="invites-heading" className="space-y-3">
        <h2 id="invites-heading" className="text-xl font-semibold">
          {t('studio:students.invites.title')}
        </h2>
        <InvitesSection courseId={course.id} timeZone={user?.timeZone} />
      </section>

      <GrantAccessDialog
        courseId={course.id}
        students={query.data ?? []}
        open={granting}
        onOpenChange={setGranting}
      />
      <InviteDialog courseId={course.id} open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('studio:students.revokeDialog.title')}
        description={t('studio:students.revokeDialog.description', {
          name: revoking?.user.name ?? '',
        })}
        confirmLabel={t('studio:students.revoke')}
        onConfirm={() => void revoke()}
      />
    </div>
  );
}
