export type ServiceErrorCode =
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'conflict'
  | 'unavailable'
  | 'rate_limited';

/**
 * Standard error of any service implementation (mock or real API).
 * The UI translates `code` into a message; `message` is only meant for logs.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
