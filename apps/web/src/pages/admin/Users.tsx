import { roleSchema, type Role, type User } from '@opencourse/shared';
import { Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
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
import { EditUserDialog } from '@/features/admin/EditUserDialog';
import { InviteUserDialog } from '@/features/admin/InviteUserDialog';
import { useAdminUsers, useUserMutations } from '@/hooks/adminQueries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';

type StatusFilter = 'active' | 'inactive';

function UserRow({
  user,
  isCurrentUser,
  timeZone,
  onEdit,
  onToggleActive,
}: {
  user: User;
  isCurrentUser: boolean;
  timeZone?: string;
  onEdit: (user: User) => void;
  onToggleActive: (user: User) => void;
}) {
  const { t } = useTranslation('admin');
  const { formatDate } = useFormatters(timeZone);

  return (
    <li className="grid gap-3 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {user.name}
          {isCurrentUser ? (
            <span className="ms-2 text-xs font-normal text-muted-foreground">{t('users.you')}</span>
          ) : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={user.role === 'admin' ? 'success' : 'neutral'}>
          {t(`roles.${user.role}`)}
        </Badge>
        <Badge variant={user.active ? 'neutral' : 'warning'}>
          {user.active ? t('users.status.active') : t('users.status.inactive')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('users.joinedOn', { date: formatDate(new Date(user.createdAt)) })}
      </p>
      <div className="flex flex-wrap gap-2 md:justify-self-end">
        <Button
          variant="outline"
          size="sm"
          disabled={isCurrentUser}
          aria-label={t('users.editFor', { name: user.name })}
          onClick={() => onEdit(user)}
        >
          {t('users.edit.open')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isCurrentUser}
          aria-label={t(user.active ? 'users.deactivateFor' : 'users.activateFor', {
            name: user.name,
          })}
          onClick={() => onToggleActive(user)}
        >
          {user.active ? t('users.deactivate') : t('users.activate')}
        </Button>
      </div>
    </li>
  );
}

/** Admin users list: search, role and status filters, edit role, deactivate and invite. */
export function AdminUsers() {
  const { t } = useTranslation(['admin', 'common']);
  const { user: currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);
  const { setActive } = useUserMutations();
  const describeError = useServiceErrorMessage();

  const search = params.get('q') ?? '';
  const parsedRole = roleSchema.safeParse(params.get('role'));
  const role: Role | undefined = parsedRole.success ? parsedRole.data : undefined;
  const rawStatus = params.get('status');
  const status: StatusFilter | undefined =
    rawStatus === 'active' || rawStatus === 'inactive' ? rawStatus : undefined;
  const hasFilters = search.trim() !== '' || role !== undefined || status !== undefined;

  const query = useAdminUsers({
    search,
    role,
    active: status === undefined ? undefined : status === 'active',
  });

  const updateParam = (key: 'q' | 'role' | 'status', value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const confirmToggle = async () => {
    if (!toggling) return;
    const activating = !toggling.active;
    try {
      await setActive.mutateAsync({ userId: toggling.id, active: activating });
      toast.success(
        t(activating ? 'admin:users.activatedToast' : 'admin:users.deactivatedToast', {
          name: toggling.name,
        }),
      );
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = hasFilters ? (
      <EmptyState
        title={t('admin:users.noResultsTitle')}
        description={t('admin:users.noResultsDescription')}
        action={{ label: t('admin:users.clearFilters'), onClick: () => setParams({}) }}
      />
    ) : (
      <EmptyState
        title={t('admin:users.emptyTitle')}
        description={t('admin:users.emptyDescription')}
        action={{ label: t('admin:users.invite.open'), onClick: () => setInviting(true) }}
      />
    );
  } else {
    body = (
      <ul className="divide-y rounded-xl border bg-surface" aria-label={t('admin:users.listLabel')}>
        {query.data.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isCurrentUser={user.id === currentUser?.id}
            timeZone={currentUser?.timeZone}
            onEdit={setEditing}
            onToggleActive={setToggling}
          />
        ))}
      </ul>
    );
  }

  const deactivating = toggling?.active ?? false;

  return (
    <section aria-labelledby="admin-users-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="admin-users-heading" className="font-serif text-xl font-semibold">
          {t('admin:users.title')}
        </h2>
        <Button onClick={() => setInviting(true)}>
          <UserPlus aria-hidden="true" />
          {t('admin:users.invite.open')}
        </Button>
      </div>

      <div role="search" className="grid gap-3 sm:grid-cols-[1fr_11rem_11rem]">
        <div className="relative">
          <label htmlFor="admin-users-search" className="sr-only">
            {t('admin:users.searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="admin-users-search"
            type="search"
            className="ps-9"
            placeholder={t('admin:users.searchPlaceholder')}
            value={search}
            onChange={(event) => updateParam('q', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="admin-users-role" className="sr-only">
            {t('admin:users.roleFilterLabel')}
          </label>
          <Select
            id="admin-users-role"
            value={role ?? ''}
            onChange={(event) => updateParam('role', event.target.value)}
          >
            <option value="">{t('admin:users.allRoles')}</option>
            {roleSchema.options.map((option) => (
              <option key={option} value={option}>
                {t(`admin:roles.${option}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="admin-users-status" className="sr-only">
            {t('admin:users.statusFilterLabel')}
          </label>
          <Select
            id="admin-users-status"
            value={status ?? ''}
            onChange={(event) => updateParam('status', event.target.value)}
          >
            <option value="">{t('admin:users.allStatuses')}</option>
            <option value="active">{t('admin:users.status.active')}</option>
            <option value="inactive">{t('admin:users.status.inactive')}</option>
          </Select>
        </div>
      </div>

      {body}

      <InviteUserDialog open={inviting} onOpenChange={setInviting} />
      {editing ? (
        <EditUserDialog key={editing.id} user={editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(open) => !open && setToggling(null)}
        title={t(
          deactivating ? 'admin:users.deactivateDialog.title' : 'admin:users.activateDialog.title',
        )}
        description={t(
          deactivating
            ? 'admin:users.deactivateDialog.description'
            : 'admin:users.activateDialog.description',
          { name: toggling?.name ?? '' },
        )}
        confirmLabel={t(deactivating ? 'admin:users.deactivate' : 'admin:users.activate')}
        destructive={deactivating}
        onConfirm={() => void confirmToggle()}
      />
    </section>
  );
}
