import { apiErrorSchema, CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { z } from 'zod';
import packageJson from '../package.json';
import { AUTH_KINDS } from './plugins/auth';

const ERROR_REF = '#/components/schemas/ApiError';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'The request is invalid',
  401: 'Authentication is missing or invalid',
  403: 'The caller may not do this',
  404: 'The resource does not exist, or the caller cannot see it',
  409: 'The request conflicts with the current state',
  429: 'Too many requests',
};

type Handler = unknown;

/** The auth kinds declared by a route's preHandler(s). */
function authKinds(preHandler: unknown) {
  const handlers: Handler[] = Array.isArray(preHandler) ? preHandler : [preHandler];
  return handlers.flatMap((handler) =>
    typeof handler === 'function' ? [AUTH_KINDS.get(handler)] : [],
  );
}

/** The standard error codes that can apply to a route, derived from what it declares. */
function errorStatusCodes(options: {
  method: string;
  url: string;
  hasInput: boolean;
  authRequired: boolean;
  rateLimited: boolean;
}) {
  const mutates = !SAFE_METHODS.has(options.method);
  const codes: number[] = [];
  if (options.hasInput) codes.push(400);
  if (options.authRequired) codes.push(401);
  // mutating requests also fail 403 on the missing CSRF header
  if (options.authRequired || mutates) codes.push(403);
  if (/[:{]/.test(options.url)) codes.push(404);
  if (mutates) codes.push(409);
  if (options.rateLimited) codes.push(429);
  return codes;
}

/** Adds the standard security, CSRF header and error responses to every route, in one place. */
const transform: NonNullable<FastifyDynamicSwaggerOptions['transform']> = (input) => {
  const { schema, url } = jsonSchemaTransform(input);
  if (!schema) return { schema, url };

  const route = input.route;
  const kinds = authKinds(route.preHandler);
  const authRequired = kinds.includes('session') || kinds.includes('apiKey');
  const methods = [route.method].flat();
  const method = methods[0] ?? 'GET';
  const mutates = !SAFE_METHODS.has(method);
  const rateLimited = Boolean((route.config as { rateLimit?: unknown } | undefined)?.rateLimit);

  const response: Record<string, unknown> = { ...(schema.response as object | undefined) };
  const codes = errorStatusCodes({
    method,
    url: route.url,
    hasInput: Boolean(schema.body ?? schema.querystring ?? schema.params),
    authRequired,
    rateLimited,
  });
  for (const code of codes) {
    // a route that documents a code itself keeps its own description
    response[code] ??= {
      description: ERROR_DESCRIPTIONS[code],
      content: { 'application/json': { schema: { $ref: ERROR_REF } } },
    };
  }

  return {
    schema: {
      ...schema,
      response,
      ...(authRequired
        ? {
            security: kinds.includes('apiKey')
              ? [{ cookieAuth: [] }, { apiKeyAuth: [] }]
              : [{ cookieAuth: [] }],
          }
        : {}),
      ...(mutates
        ? {
            headers: {
              type: 'object',
              properties: {
                [CSRF_HEADER_NAME]: {
                  type: 'string',
                  enum: [CSRF_HEADER_VALUE],
                  description: 'Required on every request that changes data (CSRF defense)',
                },
              },
              required: [CSRF_HEADER_NAME],
            },
          }
        : {}),
    },
    url,
  };
};

/** Swagger options: the version comes from package.json, the rest is shared by all routes. */
export const swaggerOptions: FastifyDynamicSwaggerOptions = {
  openapi: {
    info: { title: 'OpenCourse API', version: packageJson.version },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'oc_access',
          description: 'httpOnly session cookie (access token), set by the sign-in routes',
        },
        apiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key for plugins (prefix `oc_`), created by an admin',
        },
      },
      schemas: { ApiError: z.toJSONSchema(apiErrorSchema) as Record<string, unknown> },
    },
  },
  transform,
};
