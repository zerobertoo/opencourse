import {
  apiErrorSchema,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
  type ApiErrorCode,
} from '@opencourse/shared';
import type { ZodType } from 'zod';
import { ServiceError, type ServiceErrorCode } from '../errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions<T> {
  body?: unknown;
  /** Sends `body` as it is, with this content type, instead of JSON. */
  contentType?: string;
  /** Undefined values are skipped, so callers can pass optional filters as they are. */
  query?: Record<string, string | undefined>;
  /** Validates the response body against the shared contract. Omit for 204 responses. */
  schema?: ZodType<T>;
}

export interface ApiClientOptions {
  /** Origin of the API, such as `http://localhost:3000` (the `/api/v1` prefix is added here). */
  baseUrl: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

const ERROR_CODE_BY_API_CODE: Record<ApiErrorCode, ServiceErrorCode> = {
  not_found: 'not_found',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  validation: 'validation',
  conflict: 'conflict',
  unavailable: 'unavailable',
  rate_limited: 'rate_limited',
  internal: 'unavailable',
};

/** Used when an error response does not follow the API error shape (a proxy page, for example). */
function errorCodeFromStatus(status: number): ServiceErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'validation';
  return 'unavailable';
}

/**
 * Talks to the OpenCourse API. Sessions live in httpOnly cookies the browser manages, so there
 * is no token handling here: requests just include credentials and the CSRF header.
 */
export class ApiClient {
  private readonly origin: string;
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof fetch;
  /** Shared by concurrent requests: one refresh per expiry, not one per failed call. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: ApiClientOptions) {
    this.origin = options.baseUrl.replace(/\/+$/, '');
    this.baseUrl = `${this.origin}/api/v1`;
    this.fetchImplementation = options.fetch ?? ((...args) => fetch(...args));
  }

  /** Full address of a path the API returned (one that already includes `/api/v1`). */
  absoluteUrl(path: string): string {
    return `${this.origin}${path}`;
  }

  async request<T = void>(
    method: HttpMethod,
    path: string,
    options: ApiRequestOptions<T> = {},
  ): Promise<T> {
    let response = await this.send(method, path, options);

    // an expired access token is renewed transparently, once; auth endpoints answer 401 on purpose
    if (response.status === 401 && !path.startsWith('/auth/')) {
      if (await this.refreshSession()) response = await this.send(method, path, options);
    }
    return this.parse(response, options.schema);
  }

  /** A file the API serves, such as captions, read with the session (`path` includes `/api/v1`). */
  async blob(path: string): Promise<Blob> {
    const apiPath = path.replace(/^\/api\/v1/, '');
    let response = await this.send('GET', apiPath, {});
    if (response.status === 401 && (await this.refreshSession())) {
      response = await this.send('GET', apiPath, {});
    }
    if (!response.ok) await this.parse(response, undefined);
    return response.blob();
  }

  private async send(
    method: HttpMethod,
    path: string,
    options: ApiRequestOptions<unknown>,
  ): Promise<Response> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) query.set(key, value);
    }
    const queryString = query.size > 0 ? `?${query}` : '';

    try {
      return await this.fetchImplementation(`${this.baseUrl}${path}${queryString}`, {
        method,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
          ...(options.body === undefined
            ? {}
            : { 'content-type': options.contentType ?? 'application/json' }),
        },
        body:
          options.body === undefined
            ? undefined
            : options.contentType
              ? (options.body as string)
              : JSON.stringify(options.body),
      });
    } catch {
      throw new ServiceError('unavailable', 'Could not reach the API');
    }
  }

  private refreshSession(): Promise<boolean> {
    this.refreshInFlight ??= this.send('POST', '/auth/refresh', {})
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  private async parse<T>(response: Response, schema: ZodType<T> | undefined): Promise<T> {
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = apiErrorSchema.safeParse(body);
      if (parsed.success) {
        const { details } = parsed.data.error;
        const field = (details as { field?: unknown } | null | undefined)?.field;
        throw new ServiceError(
          ERROR_CODE_BY_API_CODE[parsed.data.error.code],
          parsed.data.error.message,
          typeof field === 'string' ? field : undefined,
        );
      }
      throw new ServiceError(errorCodeFromStatus(response.status), `API error ${response.status}`);
    }

    if (!schema) return undefined as T;
    const body: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(body);
    // a response that breaks the contract is a server problem, not something the user can fix
    if (!parsed.success) throw new ServiceError('unavailable', 'Unexpected response from the API');
    return parsed.data;
  }
}
