import type { ApiKey, ApiKeyWithToken, CreateApiKeyRequest } from '@opencourse/shared';

/** API keys for server-side plugins on the grant routes. Admin only. */
export interface ApiKeyService {
  /** Newest first. Tokens are never included. */
  list(): Promise<ApiKey[]>;
  /** The token is in this result only; it is never returned by `list` or `revoke`. */
  create(input: CreateApiKeyRequest): Promise<ApiKeyWithToken>;
  /** Idempotent: revoking a revoked key changes nothing. */
  revoke(id: string): Promise<ApiKey>;
}
