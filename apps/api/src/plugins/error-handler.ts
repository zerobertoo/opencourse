import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ApiError, ApiErrorCode } from '@opencourse/shared';
import { HttpError } from '../errors';

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'unavailable',
};

/** Builds the standard error body shared with the web client. */
function toErrorBody(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Maps every failure (validation, unknown route, thrown errors) onto the shared error shape. */
export const errorHandlerPlugin = fp(async (app) => {
  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(toErrorBody('not_found', `Route ${request.method} ${request.url} not found`));
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .send(toErrorBody('validation', 'Request validation failed', error.validation));
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      // never leak internals of an unexpected failure
      return reply
        .code(status)
        .send(toErrorBody(CODE_BY_STATUS[status] ?? 'internal', 'Internal server error'));
    }

    return reply
      .code(status)
      .send(
        toErrorBody(
          CODE_BY_STATUS[status] ?? 'validation',
          (error as Error).message,
          error instanceof HttpError ? error.details : undefined,
        ),
      );
  });
});
