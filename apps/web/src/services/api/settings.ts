import { platformSettingsSchema } from '@opencourse/shared';
import type { SettingsService } from '../settings';
import type { ApiClient } from './client';

/** SettingsService backed by the real API. */
export function createApiSettingsService(client: ApiClient): SettingsService {
  return {
    get: () => client.request('GET', '/settings', { schema: platformSettingsSchema }),
    update: (patch) =>
      client.request('PATCH', '/admin/settings', { body: patch, schema: platformSettingsSchema }),
  };
}
