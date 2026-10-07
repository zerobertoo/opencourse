import { createHmac } from 'node:crypto';

/**
 * Value of the `OpenCourse-Signature` header: `t=<unix seconds>,v1=<hex>`, where `v1` is the
 * HMAC-SHA256 of `<t>.<body>` keyed with the endpoint secret. Receivers recompute it and may
 * reject an old `t` to stop replays.
 */
export function signWebhook(secret: string, body: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}
