import { randomUUID } from 'node:crypto';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Redis } from 'ioredis';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import type { Mail, Mailer } from '../src/mail/mailer';
import { startWorker, type WorkerOptions, type WorkerRuntime } from '../src/worker/runtime';

/** Records e-mails instead of sending them. */
export class FakeMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }

  /** The most recent e-mail sent to an address, or undefined. */
  lastTo(address: string): Mail | undefined {
    return [...this.sent].reverse().find((mail) => mail.to === address);
  }
}

export interface TestApp {
  app: FastifyInstance;
  config: Config;
  mailer: FakeMailer;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig({ ...process.env, ...env });
  const mailer = new FakeMailer();
  const app = await buildApp(config, { mailer });
  await app.ready();
  return { app, config, mailer };
}

export interface TestWorker extends WorkerRuntime {
  /** Stops the worker and deletes its queue keys from Redis. */
  dispose(): Promise<void>;
}

/** Starts a worker on a queue of its own (fast polling and retries) that sends through `mailer`. */
export async function startTestWorker(
  mailer: Mailer,
  options: Pick<WorkerOptions, 'retryDelayMs'> = {},
): Promise<TestWorker> {
  const config = loadConfig(process.env);
  const queuePrefix = `opencourse:test-queue:${randomUUID()}`;
  const worker = await startWorker(config, {
    mailer,
    queuePrefix,
    pollIntervalMs: 20,
    retryDelayMs: options.retryDelayMs ?? 20,
  });
  return {
    ...worker,
    async dispose() {
      await worker.stop();
      const redis = new Redis(config.REDIS_URL);
      const keys = await redis.keys(`${queuePrefix}:*`);
      if (keys.length > 0) await redis.del(...keys);
      redis.disconnect();
    },
  };
}

/** Empties every table the API writes to, so each test starts from a fresh instance. */
export async function resetDatabase(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`truncate table users, sessions, password_reset_tokens, invites, courses, grants, audit_log, outbox_events restart identity cascade`,
  );
}

/** Pulls the link out of an e-mail body. */
export function extractLink(text: string): string {
  const match = /https?:\/\/\S+/.exec(text);
  if (!match) throw new Error('No link found in e-mail');
  return match[0];
}

/**
 * A browser stand-in: keeps cookies between requests and sends the CSRF header on writes,
 * exactly like the real web client does.
 */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly app: FastifyInstance) {}

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      csrf?: boolean;
      /** Pretends the request comes from another IP address. */
      remoteAddress?: string;
    } = {},
  ): Promise<LightMyRequestResponse> {
    const cookieHeader = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await this.app.inject({
      method,
      url,
      remoteAddress: options.remoteAddress,
      payload: options.body === undefined ? undefined : (options.body as object),
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(options.csrf === false ? {} : { [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE }),
        ...options.headers,
      },
    });
    for (const cookie of response.cookies) {
      // an expired or emptied cookie means "delete"
      if (cookie.value === '' || (cookie.maxAge !== undefined && cookie.maxAge <= 0)) {
        this.cookies.delete(cookie.name);
      } else {
        this.cookies.set(cookie.name, cookie.value);
      }
    }
    return response;
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body?: unknown) {
    return this.request('POST', url, { body });
  }
  put(url: string, body?: unknown) {
    return this.request('PUT', url, { body });
  }
  patch(url: string, body?: unknown) {
    return this.request('PATCH', url, { body });
  }
  delete(url: string) {
    return this.request('DELETE', url);
  }
}

export const STRONG_PASSWORD = 'correct horse battery';

/** Registers a user through the API and returns a client already signed in as them. */
export async function registerClient(
  app: FastifyInstance,
  email: string,
  name = 'Test User',
): Promise<{ client: TestClient; userId: string }> {
  const client = new TestClient(app);
  const response = await client.post('/api/v1/auth/register', {
    name,
    email,
    password: STRONG_PASSWORD,
  });
  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.statusCode} ${response.body}`);
  }
  return { client, userId: response.json().user.id };
}
