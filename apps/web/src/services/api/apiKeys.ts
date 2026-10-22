import {
  apiKeyResponseSchema,
  apiKeyWithTokenResponseSchema,
  listApiKeysResponseSchema,
} from '@opencourse/shared';
import type { ApiKeyService } from '../apiKeys';
import type { ApiClient } from './client';

/** `ApiKeyService` backed by the real API. */
export function createApiApiKeyService(client: ApiClient): ApiKeyService {
  return {
    async list() {
      const { apiKeys } = await client.request('GET', '/admin/api-keys', {
        schema: listApiKeysResponseSchema,
      });
      return apiKeys;
    },

    async create(input) {
      const { apiKey } = await client.request('POST', '/admin/api-keys', {
        body: input,
        schema: apiKeyWithTokenResponseSchema,
      });
      return apiKey;
    },

    async revoke(id) {
      const { apiKey } = await client.request(
        'POST',
        `/admin/api-keys/${encodeURIComponent(id)}/revoke`,
        { schema: apiKeyResponseSchema },
      );
      return apiKey;
    },
  };
}
