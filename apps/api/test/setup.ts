import { resolveTestDatabaseUrl } from './database-url';

// defaults match compose.yaml, so tests run against `docker compose up -d postgres redis`
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.AUTH_SECRET ??= 'test-only-secret-with-at-least-32-characters!!';
process.env.RATE_LIMIT_DISABLED ??= 'true';
