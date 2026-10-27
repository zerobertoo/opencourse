import {
  platformSettingsProblem,
  platformSettingsSchema,
  updatePlatformSettingsRequestSchema,
} from '@opencourse/shared';
import { ServiceError } from '../errors';
import type { SettingsService } from '../settings';
import type { MockContext } from './context';
import { clone } from './store';

export function createMockSettingsService(context: MockContext): SettingsService {
  const { store } = context;

  return {
    get: () => context.run('settings.get', () => clone(store.db.settings)),

    update: (patch) =>
      context.run('settings.update', () => {
        context.requireRole('admin');
        // the same check the API runs on the request, so the demo refuses what the server would
        if (!updatePlatformSettingsRequestSchema.safeParse(patch).success) {
          throw new ServiceError('validation', 'Invalid settings');
        }
        const merged = {
          ...store.db.settings,
          ...patch,
          brand: { ...store.db.settings.brand, ...patch.brand },
          email: { ...store.db.settings.email, ...patch.email },
          video: { ...store.db.settings.video, ...patch.video },
        };

        const parsed = platformSettingsSchema.safeParse(merged);
        if (!parsed.success) throw new ServiceError('validation', 'Invalid settings');
        const problem = platformSettingsProblem(parsed.data);
        if (problem) throw new ServiceError('validation', problem);

        store.mutate((db) => {
          db.settings = parsed.data;
        });
        return clone(parsed.data);
      }),
  };
}
