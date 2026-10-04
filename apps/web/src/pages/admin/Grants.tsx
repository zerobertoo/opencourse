import { grantStatusSchema, type Grant, type GrantStatus } from '@opencourse/shared';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ExtendGrantDialog } from '@/features/admin/ExtendGrantDialog';
import {
  useAdminGrantMutations,
  useAdminGrants,
  useAllCourses,
  useAllUsers,
} from '@/hooks/adminQueries';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';

interface GrantRowData {
  grant: Grant;
  userName: string;
  userEmail: string;
  courseTitle: string;
}

function GrantRow({
  data,
  timeZone,
  onExtend,
  onRevoke,
}: {
  data: GrantRowData;
  timeZone?: string;
  onExtend: (data: GrantRowData) => void;
  onRevoke: (data: GrantRowData) => void;
}) {
  const { t } = useTranslation('admin');
  const { formatDate } = useFormatters(timeZone);
  const { grant, userName, userEmail, courseTitle } = data;

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{userName}</p>
        <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
      </div>
      <p className="min-w-0 truncate text-sm">{courseTitle}</p>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={grant.status === 'active' ? 'success' : 'neutral'}>
            {t(`grants.status.${grant.status}`)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t(`grants.source.${grant.source}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {grant.expiresAt
            ? t('grants.accessUntil', { date: formatDate(new Date(grant.expiresAt)) })
            : t('grants.lifetime')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-self-end">
        {grant.status !== 'revoked' ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={t('grants.extendFor', { name: userName, course: courseTitle })}
            onClick={() => onExtend(data)}
          >
            {t('grants.extend.open')}
          </Button>
        ) : null}
        {grant.status === 'active' ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={t('grants.revokeFor', { name: userName, course: courseTitle })}
            onClick={() => onRevoke(data)}
          >
            {t('grants.revoke')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** Global grants list (all courses): filters, revoke and extend expiry. */
export function AdminGrants() {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { user: currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [extending, setExtending] = useState<GrantRowData | null>(null);
  const [revoking, setRevoking] = useState<GrantRowData | null>(null);
  const { revoke } = useAdminGrantMutations();
  const describeError = useServiceErrorMessage();

  const search = params.get('q') ?? '';
  const courseId = params.get('course') ?? '';
  const parsedStatus = grantStatusSchema.safeParse(params.get('status'));
  const status: GrantStatus | undefined = parsedStatus.success ? parsedStatus.data : undefined;
  const hasFilters = search.trim() !== '' || courseId !== '' || status !== undefined;

  const grantsQuery = useAdminGrants({ courseId: courseId || undefined, status });
  const usersQuery = useAllUsers();
  const coursesQuery = useAllCourses();

  const locale = toLocale(i18n.resolvedLanguage);
  const courseTitles = useMemo(
    () =>
      new Map(
        (coursesQuery.data ?? []).map((course) => [
          course.id,
          localizeCourse(course, locale).title,
        ]),
      ),
    [coursesQuery.data, locale],
  );

  const rows = useMemo(() => {
    const users = new Map((usersQuery.data ?? []).map((user) => [user.id, user]));
    const term = search.trim().toLowerCase();
    return (grantsQuery.data ?? [])
      .map((grant): GrantRowData => {
        const user = users.get(grant.userId);
        return {
          grant,
          userName: user?.name ?? grant.userId,
          userEmail: user?.email ?? '',
          courseTitle: courseTitles.get(grant.courseId) ?? grant.courseId,
        };
      })
      .filter(
        (row) =>
          term === '' ||
          row.userName.toLowerCase().includes(term) ||
          row.userEmail.toLowerCase().includes(term),
      );
  }, [grantsQuery.data, usersQuery.data, courseTitles, search]);

  const updateParam = (key: 'q' | 'course' | 'status', value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const confirmRevoke = async () => {
    if (!revoking) return;
    try {
      await revoke.mutateAsync(revoking.grant.id);
      toast.success(t('admin:grants.revokedToast', { name: revoking.userName }));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const queries = [grantsQuery, usersQuery, coursesQuery];
  let body: React.ReactNode;
  if (queries.some((query) => query.isPending)) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (queries.some((query) => query.isError)) {
    body = (
      <ErrorState
        onRetry={() =>
          queries.filter((query) => query.isError).forEach((query) => void query.refetch())
        }
      />
    );
  } else if (rows.length === 0) {
    body = hasFilters ? (
      <EmptyState
        title={t('admin:grants.noResultsTitle')}
        description={t('admin:grants.noResultsDescription')}
        action={{ label: t('admin:grants.clearFilters'), onClick: () => setParams({}) }}
      />
    ) : (
      <EmptyState
        title={t('admin:grants.emptyTitle')}
        description={t('admin:grants.emptyDescription')}
      />
    );
  } else {
    body = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('admin:grants.listLabel')}
      >
        {rows.map((row) => (
          <GrantRow
            key={row.grant.id}
            data={row}
            timeZone={currentUser?.timeZone}
            onExtend={setExtending}
            onRevoke={setRevoking}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="admin-grants-heading" className="space-y-4">
      <h2 id="admin-grants-heading" className="font-serif text-xl font-semibold">
        {t('admin:grants.title')}
      </h2>

      <div role="search" className="grid gap-3 sm:grid-cols-[1fr_14rem_11rem]">
        <div className="relative">
          <label htmlFor="admin-grants-search" className="sr-only">
            {t('admin:grants.searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="admin-grants-search"
            type="search"
            className="ps-9"
            placeholder={t('admin:grants.searchPlaceholder')}
            value={search}
            onChange={(event) => updateParam('q', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="admin-grants-course" className="sr-only">
            {t('admin:grants.courseFilterLabel')}
          </label>
          <Select
            id="admin-grants-course"
            value={courseId}
            onChange={(event) => updateParam('course', event.target.value)}
          >
            <option value="">{t('admin:grants.allCourses')}</option>
            {[...courseTitles].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="admin-grants-status" className="sr-only">
            {t('admin:grants.statusFilterLabel')}
          </label>
          <Select
            id="admin-grants-status"
            value={status ?? ''}
            onChange={(event) => updateParam('status', event.target.value)}
          >
            <option value="">{t('admin:grants.allStatuses')}</option>
            {grantStatusSchema.options.map((option) => (
              <option key={option} value={option}>
                {t(`admin:grants.status.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {body}

      {extending ? (
        <ExtendGrantDialog
          key={extending.grant.id}
          grant={extending.grant}
          userName={extending.userName}
          onClose={() => setExtending(null)}
        />
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('admin:grants.revokeDialog.title')}
        description={t('admin:grants.revokeDialog.description', {
          name: revoking?.userName ?? '',
          course: revoking?.courseTitle ?? '',
        })}
        confirmLabel={t('admin:grants.revoke')}
        onConfirm={() => void confirmRevoke()}
      />
    </section>
  );
}
