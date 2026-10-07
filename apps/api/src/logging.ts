import type { FastifyRequest } from 'fastify';

/**
 * Replaces the secrets in `/invites/<token>` paths and `?token=` query values (video playback
 * addresses). Both are bearer credentials, and request logs are readable by far more people than
 * the e-mail or the page that held them.
 */
export function maskSensitiveUrl(url: string): string {
  return url
    .replace(/(\/invites\/)[^/?#]+/, '$1[redacted]')
    .replace(/([?&]token=)[^&#]*/g, '$1[redacted]');
}

/** Same fields as Fastify's default request serializer, with the URL masked. */
export function serializeRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: maskSensitiveUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}
