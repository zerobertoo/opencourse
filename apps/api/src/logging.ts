import type { FastifyRequest } from 'fastify';

/**
 * Replaces the secret in `/invites/<token>` URLs. The token is a bearer credential (whoever has
 * it can accept the invite), and request logs are readable by far more people than the e-mail.
 */
export function maskSensitiveUrl(url: string): string {
  return url.replace(/(\/invites\/)[^/?#]+/, '$1[redacted]');
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
