import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from '@opencourse/shared';
import { isPublicAddress } from './network';
import { signWebhook } from './signature';

export interface WebhookRequest {
  url: string;
  secret: string;
  eventName: string;
  deliveryId: string;
  /** Exact JSON text that is signed and sent. */
  body: string;
  allowPrivateNetworks: boolean;
  timeoutMs: number;
}

/** What came back. `refused` means nothing was sent because the destination is not allowed. */
export interface WebhookResponse {
  statusCode: number | null;
  error: string | null;
  refused: boolean;
}

const MAX_ERROR_LENGTH = 300;

function failure(message: string, refused = false): WebhookResponse {
  return { statusCode: null, error: message.slice(0, MAX_ERROR_LENGTH), refused };
}

/**
 * Sends one signed POST. Never throws: the caller decides from the result whether to retry.
 * Unless private networks are allowed, every address the host resolves to must be public, and the
 * connection goes to the address that was checked, so DNS cannot change between check and request.
 * Redirects are never followed.
 */
export async function postWebhook(input: WebhookRequest): Promise<WebhookResponse> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return failure('Invalid URL', true);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && input.allowPrivateNetworks)) {
    return failure('Only https is allowed here', true);
  }

  // one deadline for the whole exchange, name resolution included
  const signal = AbortSignal.timeout(input.timeoutMs);
  const timedOut = new Promise<never>((_resolve, reject) =>
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
  );
  // rejects at the deadline even when nothing is racing it (an IP literal skips the lookup)
  timedOut.catch(() => undefined);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await Promise.race([lookup(host, { all: true }), timedOut]);
  } catch (error) {
    return signal.aborted
      ? failure(`Timed out after ${input.timeoutMs} ms`)
      : failure(`DNS lookup failed: ${(error as Error).message}`);
  }
  const target = addresses[0];
  if (!target) return failure('Host did not resolve to any address');
  if (!input.allowPrivateNetworks && !addresses.every(({ address }) => isPublicAddress(address))) {
    return failure('Destination is not a public address', true);
  }

  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<WebhookResponse>((resolve) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const request = send(
      url,
      {
        method: 'POST',
        signal,
        // connect to the address that passed the check
        lookup: (_host, options, callback) => {
          if ((options as { all?: boolean }).all) {
            (callback as (error: null, result: typeof addresses) => void)(null, [target]);
          } else {
            callback(null, target.address, target.family);
          }
        },
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(input.body),
          'user-agent': 'OpenCourse-Webhooks',
          [WEBHOOK_EVENT_HEADER]: input.eventName,
          [WEBHOOK_DELIVERY_HEADER]: input.deliveryId,
          [WEBHOOK_SIGNATURE_HEADER]: signWebhook(input.secret, input.body, timestamp),
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        // only a response that arrived whole counts: headers followed by a reset or a stall
        // are not an answer
        let complete = false;
        response.on('end', () => {
          complete = true;
          resolve({ statusCode, error: null, refused: false });
        });
        response.on('error', () => undefined);
        response.on('close', () => {
          if (complete) return;
          resolve(
            signal.aborted
              ? failure(`Timed out after ${input.timeoutMs} ms`)
              : failure('Connection closed before the response ended'),
          );
        });
        // the body is not stored, only drained so the socket frees up
        response.resume();
      },
    );
    request.on('error', (error) =>
      resolve(
        signal.aborted
          ? failure(`Timed out after ${input.timeoutMs} ms`)
          : failure(error.message || 'Request failed'),
      ),
    );
    request.end(input.body);
  });
}
