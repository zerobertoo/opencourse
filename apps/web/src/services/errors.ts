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
  /** Name of the input a validation error is about, when the service knows it. */
  readonly field: string | undefined;

  constructor(code: ServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.field = field;
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
