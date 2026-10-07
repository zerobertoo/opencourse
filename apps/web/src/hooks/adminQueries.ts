import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWebhookRequest,
  PlatformSettings,
  Role,
  UpdateWebhookRequest,
} from '@opencourse/shared';
import type { CreateInviteInput, GrantFilters, UserFilters } from '@/services';
import { useServices } from '@/services/ServicesContext';
import { studioKeys } from './studioQueries';

/** Cache keys of the admin area. Everything here is dropped when the signed-in user changes. */
export const adminKeys = {
  users: (filters: UserFilters) => ['admin', 'users', filters] as const,
  allUsers: ['admin', 'all-users'] as const,
  grants: (filters: GrantFilters) => ['admin', 'grants', filters] as const,
  courses: ['admin', 'courses'] as const,
};

export function useAdminUsers(filters: UserFilters) {
  const { users } = useServices();
  return useQuery({
    queryKey: adminKeys.users(filters),
    queryFn: () => users.list(filters),
    placeholderData: keepPreviousData,
  });
}

/** Every user, so grant rows can show names instead of ids. */
export function useAllUsers() {
  const { users } = useServices();
  return useQuery({ queryKey: adminKeys.allUsers, queryFn: () => users.list() });
}

/** Every course, so grant rows and filters can show titles. */
export function useAllCourses() {
  const { courses } = useServices();
  return useQuery({
    queryKey: adminKeys.courses,
    queryFn: () => courses.list({ scope: 'managed' }),
  });
}

export function useAdminGrants(filters: GrantFilters) {
  const { grants } = useServices();
  return useQuery({
    queryKey: adminKeys.grants(filters),
    queryFn: () => grants.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useUserMutations() {
  const { users, grants } = useServices();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: studioKeys.assignable }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);

  return {
    updateRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
        users.updateRole(userId, role),
      onSuccess: refresh,
    }),
    setActive: useMutation({
      mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
        users.setActive(userId, active),
      onSuccess: refresh,
    }),
    invite: useMutation({
      mutationFn: (input: CreateInviteInput) => grants.createInvite(input),
    }),
  };
}

export function useAdminGrantMutations() {
  const { grants } = useServices();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'grants'] }),
      queryClient.invalidateQueries({ queryKey: ['studio'] }),
      queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
    ]);

  return {
    revoke: useMutation({
      mutationFn: (grantId: string) => grants.revoke(grantId),
      onSuccess: refresh,
    }),
    extend: useMutation({
      mutationFn: ({ grantId, expiresAt }: { grantId: string; expiresAt: string | null }) =>
        grants.extend(grantId, expiresAt),
      onSuccess: refresh,
    }),
  };
}

export function usePlatformSettings() {
  const { settings } = useServices();
  return useQuery({ queryKey: studioKeys.settings, queryFn: () => settings.get() });
}

export function useUpdateSettings() {
  const { settings } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PlatformSettings>) => settings.update(patch),
    onSuccess: (saved) => queryClient.setQueryData(studioKeys.settings, saved),
  });
}

const webhookKeys = {
  list: ['admin', 'webhooks'] as const,
  deliveries: (webhookId: string) => ['admin', 'webhooks', webhookId, 'deliveries'] as const,
};

export function useWebhooks() {
  const { webhooks } = useServices();
  return useQuery({ queryKey: webhookKeys.list, queryFn: () => webhooks.list() });
}

export function useWebhookDeliveries(webhookId: string) {
  const { webhooks } = useServices();
  return useQuery({
    queryKey: webhookKeys.deliveries(webhookId),
    queryFn: () => webhooks.listDeliveries(webhookId),
  });
}

export function useWebhookMutations() {
  const { webhooks } = useServices();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: webhookKeys.list });

  return {
    create: useMutation({
      mutationFn: (input: CreateWebhookRequest) => webhooks.create(input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: UpdateWebhookRequest }) =>
        webhooks.update(id, patch),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => webhooks.remove(id), onSuccess: refresh }),
    rotateSecret: useMutation({
      mutationFn: (id: string) => webhooks.rotateSecret(id),
      onSuccess: refresh,
    }),
    sendTest: useMutation({ mutationFn: (id: string) => webhooks.sendTest(id) }),
    retryDelivery: useMutation({
      mutationFn: (deliveryId: string) => webhooks.retryDelivery(deliveryId),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookKeys.list }),
    }),
  };
}
