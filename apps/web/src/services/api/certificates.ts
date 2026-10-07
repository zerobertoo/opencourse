import { listCertificatesResponseSchema, publicCertificateSchema } from '@opencourse/shared';
import type { CertificateService } from '../certificates';
import { isServiceError } from '../errors';
import type { ApiClient } from './client';

/** CertificateService backed by the real API. The server issues certificates when a course ends. */
export function createApiCertificateService(client: ApiClient): CertificateService {
  return {
    async listMine() {
      const { certificates } = await client.request('GET', '/me/certificates', {
        schema: listCertificatesResponseSchema,
      });
      return certificates;
    },

    async verify(code) {
      try {
        return await client.request(
          'GET',
          `/certificates/verify/${encodeURIComponent(code.trim())}`,
          { schema: publicCertificateSchema },
        );
      } catch (error) {
        // a malformed and an unknown code look the same: "not a certificate"
        if (isServiceError(error) && error.code === 'not_found') return null;
        throw error;
      }
    },
  };
}
