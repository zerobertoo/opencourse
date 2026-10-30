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

interface ResolvedAddress {
  address: string;
  family: number;
}

/** Where a webhook may go: the parsed address and the IP to connect to, or why nothing may be sent. */
export type Destination =
  | { url: URL; target: ResolvedAddress; failure?: undefined }
  | { url?: undefined; target?: undefined; failure: WebhookResponse };

/**
 * The destination rule, shared by delivery and by saving an endpoint: only https (http too when
 * private networks are allowed), and unless they are allowed, every address the host resolves to
 * must be public. `failure.refused` tells a forbidden destination from one that merely did not
 * answer (no DNS record yet, a timeout). The deadline in `signal` covers name resolution;
 * `timeoutMs` only words the message.
 */
export async function resolveDestination(
  rawUrl: string,
  allowPrivateNetworks: boolean,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Destination> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { failure: failure('Invalid URL', true) };
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivateNetworks)) {
    return { failure: failure('Webhook URLs must use https', true) };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: ResolvedAddress[];
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) }];
  } else {
    let onAbort: (() => void) | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error('timeout'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      addresses = await Promise.race([lookup(host, { all: true }), timedOut]);
    } catch (error) {
      return {
        failure: signal.aborted
          ? failure(`Timed out after ${timeoutMs} ms`)
          : failure(`DNS lookup failed: ${(error as Error).message}`),
      };
    } finally {
      signal.removeEventListener('abort', onAbort!);
      // the race may be lost: the rejection must not surface later
      timedOut.catch(() => undefined);
    }
  }
  const target = addresses[0];
  if (!target) return { failure: failure('Host did not resolve to any address') };
  if (!allowPrivateNetworks && !addresses.every(({ address }) => isPublicAddress(address))) {
    return { failure: failure('Destination is not a public address', true) };
  }
  return { url, target };
}

const MAX_DRAINED_RESPONSE_BYTES = 64 * 1024;

/**
 * Sends one signed POST. Never throws: the caller decides from the result whether to retry.
 * The connection goes to the address `resolveDestination` checked, so DNS cannot change between
 * check and request. Redirects are never followed.
 */
export async function postWebhook(input: WebhookRequest): Promise<WebhookResponse> {
  // one deadline for the whole exchange, name resolution included
  const signal = AbortSignal.timeout(input.timeoutMs);
  const destination = await resolveDestination(
    input.url,
    input.allowPrivateNetworks,
    signal,
    input.timeoutMs,
  );
  if (destination.failure) return destination.failure;
  const { url, target } = destination;

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
            (callback as (error: null, result: ResolvedAddress[]) => void)(null, [target]);
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
        // the body is not stored, only drained so the socket frees up; a receiver that keeps
        // sending has already answered with its status, so the connection is cut
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received <= MAX_DRAINED_RESPONSE_BYTES || complete) return;
          complete = true;
          resolve({ statusCode, error: null, refused: false });
          request.destroy();
        });
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
