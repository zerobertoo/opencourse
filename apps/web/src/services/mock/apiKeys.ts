import { PLUGIN_TOKEN_PREFIX, createApiKeyRequestSchema } from '@opencourse/shared';
import type { ApiKeyService } from '../apiKeys';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import { clone } from './store';

const TOKEN_PREFIX_LENGTH = 10;

export function createMockApiKeyService(context: MockContext): ApiKeyService {
  const { store } = context;

  return {
    list: () =>
      context.run('apiKeys.list', () => {
        context.requireRole('admin');
        return clone([...store.db.apiKeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }),

    create: (input) =>
      context.run('apiKeys.create', () => {
        const admin = context.requireRole('admin');
        const parsed = createApiKeyRequestSchema.safeParse(input);
        if (!parsed.success) throw new ServiceError('validation', 'Invalid API key');
        const id = store.nextId('api-key');
        // the mock keeps no token: it only exists in this result, like on the server
        const token = `${PLUGIN_TOKEN_PREFIX}mock${id.replaceAll('-', '')}`;
        const apiKey = {
          id,
          name: parsed.data.name,
          tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
          createdById: admin.id,
          createdAt: context.now().toISOString(),
          lastUsedAt: null,
          revokedAt: null,
        };
        store.mutate((db) => {
          db.apiKeys.push(apiKey);
        });
        return clone({ ...apiKey, token });
      }),

    revoke: (id) =>
      context.run('apiKeys.revoke', () => {
        context.requireRole('admin');
        const apiKey = store.db.apiKeys.find((candidate) => candidate.id === id);
        if (!apiKey) throw new ServiceError('not_found', `API key not found: ${id}`);
        if (!apiKey.revokedAt) {
          store.mutate(() => {
            apiKey.revokedAt = context.now().toISOString();
          });
        }
        return clone(apiKey);
      }),
  };
}
