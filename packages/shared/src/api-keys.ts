import { z } from 'zod';
import { idSchema, isoDateSchema } from './base';

/** Every key starts with this, which also lets secret scanners recognise a leaked one. */
export const API_KEY_PREFIX = 'oc_';

export const apiKeySchema = z.object({
  id: idSchema,
  name: z.string(),
  /** First characters of the token, enough to tell keys apart. */
  tokenPrefix: z.string(),
  createdById: idSchema,
  createdAt: isoDateSchema,
  lastUsedAt: isoDateSchema.nullable(),
  revokedAt: isoDateSchema.nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** The token travels only in the response to create; reads never include it. */
export const apiKeyWithTokenSchema = apiKeySchema.extend({ token: z.string().min(1) });
export type ApiKeyWithToken = z.infer<typeof apiKeyWithTokenSchema>;

export const apiKeyIdParamsSchema = z.object({ id: idSchema });

export const createApiKeyRequestSchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeyResponseSchema = z.object({ apiKey: apiKeySchema });
export const apiKeyWithTokenResponseSchema = z.object({ apiKey: apiKeyWithTokenSchema });
export const listApiKeysResponseSchema = z.object({ apiKeys: z.array(apiKeySchema) });
