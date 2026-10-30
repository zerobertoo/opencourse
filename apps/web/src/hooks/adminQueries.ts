import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateApiKeyRequest,
  CreateWebhookRequest,
  Role,
  UpdatePlatformSettingsRequest,
  UpdateWebhookRequest,
  WebhookDelivery,
} from '@opencourse/shared';
import type { CreateInviteInput, GrantFilters, UserFilters } from '@/services';
import { useServices } from '@/services/ServicesContext';
import { queryRoots } from './queries';
import { studioKeys } from './studioQueries';

/** Cache keys of the admin area. Everything here is dropped when the signed-in user changes. */
export const adminKeys = {
  users: (filters: UserFilters) => [queryRoots.admin, 'users', filters] as const,
  allUsers: [queryRoots.admin, 'all-users'] as const,
  allGrants: [queryRoots.admin, 'grants'] as const,
  grants: (filters: GrantFilters) => [queryRoots.admin, 'grants', filters] as const,
  courses: [queryRoots.admin, 'courses'] as const,
  failedVideos: [queryRoots.admin, 'failed-videos'] as const,
  webhooks: [queryRoots.admin, 'webhooks'] as const,
  webhookDeliveries: (webhookId: string) =>
    [queryRoots.admin, 'webhooks', webhookId, 'deliveries'] as const,
  apiKeys: [queryRoots.admin, 'api-keys'] as const,
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
      queryClient.invalidateQueries({ queryKey: [queryRoots.admin] }),
      queryClient.invalidateQueries({ queryKey: studioKeys.assignable }),
      queryClient.invalidateQueries({ queryKey: [queryRoots.users] }),
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
      queryClient.invalidateQueries({ queryKey: adminKeys.allGrants }),
      queryClient.invalidateQueries({ queryKey: [queryRoots.studio] }),
      queryClient.invalidateQueries({ queryKey: [queryRoots.enrollments] }),
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
    mutationFn: (patch: UpdatePlatformSettingsRequest) => settings.update(patch),
    onSuccess: (saved) => queryClient.setQueryData(studioKeys.settings, saved),
  });
}

export function useFailedVideos() {
  const { video } = useServices();
  return useQuery({ queryKey: adminKeys.failedVideos, queryFn: () => video.listFailed() });
}

export function useRetryVideo() {
  const { video } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => video.retry(assetId),
    // a refused retry (someone else got there first) also leaves the list out of date
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.failedVideos }),
  });
}

export function useWebhooks() {
  const { webhooks } = useServices();
  return useQuery({ queryKey: adminKeys.webhooks, queryFn: () => webhooks.list() });
}

export const WEBHOOK_DELIVERIES_PAGE_SIZE = 50;

/** Delivery history, newest first, one page per request; `hasNextPage` is true while pages come back full. */
export function useWebhookDeliveries(webhookId: string) {
  const { webhooks } = useServices();
  return useInfiniteQuery({
    queryKey: adminKeys.webhookDeliveries(webhookId),
    queryFn: ({ pageParam }) =>
      webhooks.listDeliveries(webhookId, {
        limit: WEBHOOK_DELIVERIES_PAGE_SIZE,
        ...(pageParam ? { before: pageParam } : {}),
      }),
    initialPageParam: '',
    // each page starts after the last delivery of the previous one
    getNextPageParam: (lastPage) =>
      lastPage.length < WEBHOOK_DELIVERIES_PAGE_SIZE ? undefined : lastPage.at(-1)?.id,
    select: selectDeliveries,
  });
}

const selectDeliveries = (data: { pages: WebhookDelivery[][] }) => ({
  deliveries: data.pages.flat(),
});

export function useWebhookMutations() {
  const { webhooks } = useServices();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.webhooks });

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
      onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.webhooks }),
    }),
  };
}

export function useApiKeys() {
  const { apiKeys } = useServices();
  return useQuery({ queryKey: adminKeys.apiKeys, queryFn: () => apiKeys.list() });
}

export function useApiKeyMutations() {
  const { apiKeys } = useServices();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys });

  return {
    create: useMutation({
      mutationFn: (input: CreateApiKeyRequest) => apiKeys.create(input),
      onSuccess: refresh,
    }),
    revoke: useMutation({ mutationFn: (id: string) => apiKeys.revoke(id), onSuccess: refresh }),
  };
}
