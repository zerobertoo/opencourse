import { platformSettingsSchema } from '@opencourse/shared';
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
        const merged = {
          ...store.db.settings,
          ...patch,
          brand: { ...store.db.settings.brand, ...patch.brand },
          email: { ...store.db.settings.email, ...patch.email },
        };

        const parsed = platformSettingsSchema.safeParse(merged);
        if (!parsed.success) throw new ServiceError('validation', 'Invalid settings');
        if (!parsed.data.enabledLocales.includes(parsed.data.defaultLocale)) {
          throw new ServiceError('validation', 'The default language must be enabled');
        }

        store.mutate((db) => {
          db.settings = parsed.data;
        });
        return clone(parsed.data);
      }),
  };
}
