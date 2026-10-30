import {
  PLUGIN_TOKEN_PREFIX,
  apiKeyIdParamsSchema,
  apiKeyResponseSchema,
  apiKeyWithTokenResponseSchema,
  createApiKeyRequestSchema,
  listApiKeysResponseSchema,
  type ApiKey,
} from '@opencourse/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { recordAudit } from '../../audit';
import { generateToken, hashToken } from '../../auth/tokens';
import { apiKeys, type ApiKeyRow } from '../../db/schema';
import { notFound } from '../../errors';
import { authContext } from '../../plugins/auth';

const TOKEN_PREFIX_LENGTH = 10;

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Admin-only management of the keys server-side plugins use on the grant routes. */
export const apiKeyRoutes: FastifyPluginAsyncZod = async (app) => {
  // keys are managed with a session only: a key can never mint or revoke keys
  const guard = { preHandler: app.requireRole('admin') };

  app.get(
    '/admin/api-keys',
    {
      ...guard,
      schema: {
        tags: ['api-keys'],
        summary: 'List API keys',
        response: { 200: listApiKeysResponseSchema },
      },
    },
    async () => {
      const rows = await app.db
        .select()
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
      return { apiKeys: rows.map(toApiKey) };
    },
  );

  app.post(
    '/admin/api-keys',
    {
      ...guard,
      schema: {
        tags: ['api-keys'],
        summary: 'Create an API key',
        description:
          'The token is in this response only. Send it as `Authorization: Bearer <token>` to the grant routes; the key acts as the admin who created it.',
        body: createApiKeyRequestSchema,
        response: { 201: apiKeyWithTokenResponseSchema },
      },
    },
    async (request, reply) => {
      const token = `${PLUGIN_TOKEN_PREFIX}${generateToken()}`;
      const row = await app.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(apiKeys)
          .values({
            name: request.body.name,
            tokenHash: hashToken(token),
            tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
            createdById: authContext(request).user.id,
          })
          .returning();
        if (!created) throw new Error('Failed to create API key');
        await recordAudit(tx, {
          actorId: authContext(request).user.id,
          action: 'api_key.created',
          targetType: 'api_key',
          targetId: created.id,
          metadata: { name: created.name },
        });
        return created;
      });
      return reply.code(201).send({ apiKey: { ...toApiKey(row), token } });
    },
  );

  app.post(
    '/admin/api-keys/:id/revoke',
    {
      ...guard,
      schema: {
        tags: ['api-keys'],
        summary: 'Revoke an API key',
        description: 'Idempotent: revoking a revoked key answers 200 and changes nothing.',
        params: apiKeyIdParamsSchema,
        response: { 200: apiKeyResponseSchema },
      },
    },
    async (request) => {
      const row = await app.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.id, request.params.id))
          .for('update');
        if (!existing) throw notFound('API key not found');
        if (existing.revokedAt) return existing;
        const [revoked] = await tx
          .update(apiKeys)
          .set({ revokedAt: new Date() })
          .where(eq(apiKeys.id, existing.id))
          .returning();
        if (!revoked) throw new Error('Failed to revoke API key');
        await recordAudit(tx, {
          actorId: authContext(request).user.id,
          action: 'api_key.revoked',
          targetType: 'api_key',
          targetId: revoked.id,
          metadata: { name: revoked.name },
        });
        return revoked;
      });
      return { apiKey: toApiKey(row) };
    },
  );
};
