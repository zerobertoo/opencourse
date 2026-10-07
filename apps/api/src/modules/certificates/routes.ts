import {
  certificateCodeParamsSchema,
  listCertificatesResponseSchema,
  publicCertificateSchema,
} from '@opencourse/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { certificates } from '../../db/schema';
import { notFound } from '../../errors';
import { normalizeCertificateCode, toCertificateDetails, toPublicCertificate } from './service';

/** Public lookups are guessable only by brute force, so they are capped per client. */
const VERIFY_LIMIT = { max: 30, timeWindow: '1 minute' };

export const certificateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me/certificates',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['certificates'],
        summary: 'Certificates of the authenticated user, newest first',
        response: { 200: listCertificatesResponseSchema },
      },
    },
    async (request) => {
      const rows = await app.db
        .select()
        .from(certificates)
        .where(eq(certificates.userId, request.auth!.user.id))
        .orderBy(desc(certificates.issuedAt));
      return { certificates: rows.map(toCertificateDetails) };
    },
  );

  app.get(
    '/certificates/verify/:code',
    {
      config: { rateLimit: VERIFY_LIMIT },
      schema: {
        tags: ['certificates'],
        summary: 'Public verification of a certificate code',
        description: 'Needs no authentication. Exposes no e-mail and no ids.',
        params: certificateCodeParamsSchema,
        response: { 200: publicCertificateSchema },
      },
    },
    async (request) => {
      const code = normalizeCertificateCode(request.params.code);
      // a malformed code and an unknown one look the same
      if (!code) throw notFound('Certificate not found');
      const [row] = await app.db.select().from(certificates).where(eq(certificates.code, code));
      if (!row) throw notFound('Certificate not found');
      return toPublicCertificate(row);
    },
  );
};
