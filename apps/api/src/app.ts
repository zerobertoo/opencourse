import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Config } from './config';
import { serializeRequest } from './logging';
import { createSmtpMailer, type Mailer } from './mail/mailer';
import { healthRoutes } from './modules/health/routes';
import { authPlugin } from './plugins/auth';
import { backgroundPlugin } from './plugins/background';
import { dbPlugin } from './plugins/db';
import { errorHandlerPlugin } from './plugins/error-handler';
import { mailerPlugin } from './plugins/mailer';
import { rateLimitPlugin } from './plugins/rate-limit';
import { redisPlugin } from './plugins/redis';
import { storagePlugin } from './plugins/storage';
import { createS3Storage, type Storage } from './storage/s3';
import { v1Routes } from './routes/v1';

/** Pino options: pretty output in development, secrets redacted everywhere. */
function buildLoggerOptions(config: Config, stream?: NodeJS.WritableStream) {
  return {
    level: config.LOG_LEVEL,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
    ],
    // invite tokens travel in the URL path, so the logged URL must not carry them
    serializers: { req: serializeRequest },
    ...(stream ? { stream } : {}),
    ...(config.NODE_ENV === 'development' && !stream
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
      : {}),
  };
}

export interface AppDependencies {
  /** Replaces the SMTP mailer, so tests can read what would have been sent. */
  mailer?: Mailer;
  /** Receives the log lines instead of stdout. Tests use it to inspect what gets logged. */
  logStream?: NodeJS.WritableStream;
  /** Replaces the S3 storage. Tests use a real bucket, so this is rarely needed. */
  storage?: Storage;
  /** Isolates the job queue keys the API adds to (webhook retries); tests give each file its own. */
  queuePrefix?: string;
}

/** Builds the Fastify instance without listening, so tests can use `app.inject()`. */
export async function buildApp(
  config: Config,
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config, dependencies.logStream),
    trustProxy: config.TRUST_PROXY,
    // reuse the caller request id when present, so logs can be correlated across services
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && incoming ? incoming : randomUUID();
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(errorHandlerPlugin);
  await app.register(helmet, {
    // the API reference page loads its own inline assets
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'OpenCourse API', version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(scalar, { routePrefix: '/docs' });

  await app.register(dbPlugin, { databaseUrl: config.DATABASE_URL });
  await app.register(redisPlugin, { redisUrl: config.REDIS_URL });
  await app.register(storagePlugin, { storage: dependencies.storage ?? createS3Storage(config) });
  await app.register(backgroundPlugin);
  await app.register(mailerPlugin, { mailer: dependencies.mailer ?? createSmtpMailer(config) });
  await app.register(authPlugin, { config });
  await app.register(rateLimitPlugin, { disabled: config.RATE_LIMIT_DISABLED });

  await app.register(healthRoutes);
  await app.register(v1Routes, {
    prefix: '/api/v1',
    config,
    queuePrefix: dependencies.queuePrefix,
  });

  return app;
}
