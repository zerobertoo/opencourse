export type ServiceErrorCode =
  'not_found' | 'unauthorized' | 'forbidden' | 'validation' | 'conflict' | 'unavailable';

/**
 * Erro padrão de qualquer implementação de service (mock ou API real).
 * A interface traduz o `code` em mensagem; `message` serve apenas para logs.
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
