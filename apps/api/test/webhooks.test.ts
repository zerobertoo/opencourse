import { randomUUID } from 'node:crypto';
import {
  WEBHOOK_TEST_EVENT,
  webhookEnvelopeSchema,
  type DomainEventName,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, outboxEvents, webhookDeliveries, webhookEndpoints } from '../src/db/schema';
import { deliverWebhook, fanOutWebhooks } from '../src/modules/webhooks/delivery';
import { postWebhook } from '../src/modules/webhooks/http';
import { isPublicAddress } from '../src/modules/webhooks/network';
import { createCast } from './fixtures';
import {
  createTestApp,
  registerClient,
  resetDatabase,
  startTestWorker,
  type TestApp,
  type TestWorker,
} from './helpers';
import { signatureIsValid, WebhookReceiver } from './webhook-receiver';

const queuePrefix = `opencourse:test-queue:${randomUUID()}`;
const allowLocal = { WEBHOOKS_ALLOW_PRIVATE_NETWORKS: 'true' };

describe('outbound webhooks', () => {
  let ctx: TestApp;
  let receiver: WebhookReceiver;
  let worker: TestWorker | undefined;

  beforeAll(async () => {
    ctx = await createTestApp(allowLocal, { queuePrefix });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    receiver = await WebhookReceiver.start();
  });
  afterEach(async () => {
    await worker?.dispose();
    worker = undefined;
    await receiver.stop();
  });

  const startWorker = (options: { webhookTimeoutMs?: number } = {}) =>
    startTestWorker(ctx.mailer, { queuePrefix, env: allowLocal, ...options });

  /** An admin who owns the endpoints. The outbox is emptied so setup events are not delivered. */
  async function setup() {
    const admin = await registerClient(ctx.app, 'admin@example.com', 'Ada Admin');
    await ctx.app.db.delete(outboxEvents);
    return admin;
  }

  async function createEndpoint(
    admin: Awaited<ReturnType<typeof setup>>,
    extra: Record<string, unknown> = {},
  ) {
    const response = await admin.client.post('/api/v1/admin/webhooks', {
      url: receiver.url,
      events: ['user.created'],
      ...extra,
    });
    expect(response.statusCode).toBe(201);
    return response.json().webhook as { id: string; secret: string };
  }

  const deliveries = () => ctx.app.db.select().from(webhookDeliveries);

  describe('fan-out and delivery', () => {
    it('creates one delivery per active, subscribed endpoint', async () => {
      const admin = await setup();
      const subscribed = await createEndpoint(admin);
      await createEndpoint(admin, { active: false });
      await createEndpoint(admin, { events: ['grant.revoked'] });

      await registerClient(ctx.app, 'ana@example.com', 'Ana');
      worker = await startWorker();
      await worker.drain();

      const rows = await deliveries();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        endpointId: subscribed.id,
        eventName: 'user.created',
        status: 'succeeded',
        attempts: 1,
        lastStatusCode: 200,
      });
      expect(receiver.requests).toHaveLength(1);
    });

    it('does not duplicate deliveries when the same event is fanned out twice', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      const added: string[] = [];
      const event = {
        eventId: randomUUID(),
        eventName: 'user.created' as DomainEventName,
        createdAt: new Date().toISOString(),
        data: { userId: randomUUID() },
      };
      const addJob = async (deliveryId: string, jobId: string) => {
        added.push(`${deliveryId}:${jobId}`);
      };

      await fanOutWebhooks(ctx.app.db, event, addJob);
      await fanOutWebhooks(ctx.app.db, event, addJob);

      expect(await deliveries()).toHaveLength(1);
      // both runs offer the same job id, which the queue ignores
      expect(new Set(added).size).toBe(1);
      expect(added).toHaveLength(2);
    });

    it('sends a signed envelope the receiver can verify', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);
      const { userId } = await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      const [request] = receiver.requests;
      const [delivery] = await deliveries();
      const envelope = webhookEnvelopeSchema.parse(JSON.parse(request!.body));
      expect(envelope).toMatchObject({
        type: 'user.created',
        data: { userId, name: 'Ana', email: 'ana@example.com', locale: 'pt-BR' },
      });
      expect(request!.headers['opencourse-event']).toBe('user.created');
      expect(request!.headers['opencourse-delivery']).toBe(delivery!.id);
      expect(
        signatureIsValid(
          request!.headers['opencourse-signature'] as string,
          endpoint.secret,
          request!.body,
        ),
      ).toBe(true);
      // a wrong secret does not verify
      expect(
        signatureIsValid(
          request!.headers['opencourse-signature'] as string,
          'whsec_other',
          request!.body,
        ),
      ).toBe(false);
    });

    it('delivers an event that was written while no worker was running', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      await registerClient(ctx.app, 'ana@example.com', 'Ana');
      expect(receiver.requests).toHaveLength(0);
      expect(await deliveries()).toHaveLength(0);

      worker = await startWorker();
      await worker.drain();

      expect(receiver.requests).toHaveLength(1);
    });

    it('retries a 5xx until it succeeds', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      receiver.respond = (_request, response, count) =>
        response.writeHead(count < 3 ? 503 : 200).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      expect(await deliveries()).toMatchObject([{ status: 'succeeded', attempts: 3 }]);
    });

    it('retries a 429 too', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      receiver.respond = (_request, response, count) =>
        response.writeHead(count < 2 ? 429 : 200).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      expect(await deliveries()).toMatchObject([{ status: 'succeeded', attempts: 2 }]);
    });

    it('gives up after the last attempt and records why', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      receiver.respond = (_request, response) => response.writeHead(500).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      expect(await deliveries()).toMatchObject([
        { status: 'failed', attempts: 5, lastStatusCode: 500, lastError: 'Receiver answered 500' },
      ]);
      expect(receiver.requests).toHaveLength(5);
    });

    it('fails a plain 4xx at once, without retrying', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      receiver.respond = (_request, response) => response.writeHead(400).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      expect(await deliveries()).toMatchObject([
        { status: 'failed', attempts: 1, lastStatusCode: 400 },
      ]);
      expect(receiver.requests).toHaveLength(1);
    });

    it('treats a receiver that never answers as a timeout', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      receiver.respond = () => undefined;
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker({ webhookTimeoutMs: 100 });
      await worker.drain(20_000);

      const [row] = await deliveries();
      expect(row).toMatchObject({ status: 'failed', attempts: 5, lastStatusCode: null });
      expect(row!.lastError).toContain('Timed out');
    });

    it('does not follow a redirect and fails the delivery', async () => {
      const admin = await setup();
      await createEndpoint(admin);
      const elsewhere = await WebhookReceiver.start();
      receiver.respond = (_request, response) =>
        response.writeHead(302, { location: elsewhere.url }).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();
      await elsewhere.stop();

      expect(await deliveries()).toMatchObject([
        { status: 'failed', attempts: 1, lastStatusCode: 302 },
      ]);
      expect(elsewhere.requests).toHaveLength(0);
    });

    it('sends nothing for an endpoint deleted before the worker ran', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);
      await registerClient(ctx.app, 'ana@example.com', 'Ana');
      await admin.client.delete(`/api/v1/admin/webhooks/${endpoint.id}`);

      worker = await startWorker();
      await worker.drain();

      expect(receiver.requests).toHaveLength(0);
      expect(await deliveries()).toHaveLength(0);
    });

    it('does not send a delivery that already finished', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);
      const [delivery] = await ctx.app.db
        .insert(webhookDeliveries)
        .values({
          endpointId: endpoint.id,
          eventId: randomUUID(),
          eventName: 'user.created',
          payload: { id: randomUUID() },
          status: 'succeeded',
        })
        .returning();

      // a job that runs twice (at-least-once queue) must not notify the receiver twice
      await deliverWebhook(ctx.app.db, delivery!.id, {
        allowPrivateNetworks: true,
        timeoutMs: 1000,
        isLastAttempt: false,
      });

      expect(receiver.requests).toHaveLength(0);
    });

    it('fails without sending when the endpoint was disabled after fan-out', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin, { active: false });
      const [delivery] = await ctx.app.db
        .insert(webhookDeliveries)
        .values({
          endpointId: endpoint.id,
          eventId: randomUUID(),
          eventName: 'user.created',
          payload: { id: randomUUID() },
        })
        .returning();

      await deliverWebhook(ctx.app.db, delivery!.id, {
        allowPrivateNetworks: true,
        timeoutMs: 1000,
        isLastAttempt: false,
      });

      expect(receiver.requests).toHaveLength(0);
      expect(await deliveries()).toMatchObject([{ status: 'failed', attempts: 0 }]);
    });
  });

  describe('destinations that must not be reached', () => {
    const send = (url: string, allowPrivateNetworks = false) =>
      postWebhook({
        url,
        secret: 'whsec_x',
        eventName: 'user.created',
        deliveryId: randomUUID(),
        body: '{}',
        allowPrivateNetworks,
        timeoutMs: 1000,
      });

    it.each([
      'https://127.0.0.1/hook',
      'https://127.1.2.3/hook',
      'https://10.0.0.5/hook',
      'https://172.16.0.1/hook',
      'https://192.168.1.1/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://0.0.0.0/hook',
      'https://[::1]/hook',
      'https://[::ffff:127.0.0.1]/hook',
      'https://[fe80::1]/hook',
      'https://[fd00::1]/hook',
      'https://localhost/hook',
    ])('refuses %s without opening a connection', async (url) => {
      expect(await send(url)).toMatchObject({ statusCode: null, refused: true });
    });

    it('does not report a response that was cut off as a success', async () => {
      receiver.respond = (_request, response) => {
        response.writeHead(200, { 'content-length': '100' });
        response.write('partial');
        setTimeout(() => response.socket?.destroy(), 10);
      };
      expect(await send(receiver.url, true)).toMatchObject({ statusCode: null, refused: false });
    });

    it('refuses plain http unless private networks are allowed', async () => {
      expect(await send(receiver.url)).toMatchObject({ refused: true });
      expect(receiver.requests).toHaveLength(0);
      expect(await send(receiver.url, true)).toMatchObject({ statusCode: 200, refused: false });
    });

    it('classifies addresses', () => {
      expect(isPublicAddress('93.184.216.34')).toBe(true);
      expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
      expect(isPublicAddress('100.64.0.1')).toBe(false);
      expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
      expect(isPublicAddress('not-an-ip')).toBe(false);
      // addresses that embed an IPv4 one, and documentation ranges
      expect(isPublicAddress('64:ff9b::a00:1')).toBe(false);
      expect(isPublicAddress('2002:7f00:1::')).toBe(false);
      expect(isPublicAddress('203.0.113.9')).toBe(false);
    });
  });

  describe('admin API', () => {
    it('is for admins only', async () => {
      const cast = await createCast(ctx.app);
      const body = { url: receiver.url, events: ['user.created'] };
      for (const user of [cast.instructorA, cast.student]) {
        expect((await user.client.get('/api/v1/admin/webhooks')).statusCode).toBe(403);
        expect((await user.client.post('/api/v1/admin/webhooks', body)).statusCode).toBe(403);
      }
      const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/webhooks' });
      expect(anonymous.statusCode).toBe(401);
    });

    it('shows the secret on create and rotate only, and never writes it to the audit log', async () => {
      const admin = await setup();
      const created = await createEndpoint(admin, { description: 'CRM' });
      expect(created.secret).toMatch(/^whsec_/);

      const listed = await admin.client.get('/api/v1/admin/webhooks');
      expect(listed.json().webhooks).toHaveLength(1);
      expect(listed.body).not.toContain(created.secret);

      const patched = await admin.client.patch(`/api/v1/admin/webhooks/${created.id}`, {
        active: false,
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.body).not.toContain(created.secret);

      const rotated = await admin.client.post(`/api/v1/admin/webhooks/${created.id}/rotate-secret`);
      const newSecret = rotated.json().webhook.secret as string;
      expect(newSecret).not.toBe(created.secret);

      const audit = JSON.stringify(await ctx.app.db.select().from(auditLog));
      expect(audit).toContain('webhook.created');
      expect(audit).toContain('webhook.secret_rotated');
      expect(audit).not.toContain(created.secret);
      expect(audit).not.toContain(newSecret);
    });

    it('signs with the new secret after a rotation', async () => {
      const admin = await setup();
      const created = await createEndpoint(admin);
      const rotated = await admin.client.post(`/api/v1/admin/webhooks/${created.id}/rotate-secret`);
      const newSecret = rotated.json().webhook.secret as string;
      await registerClient(ctx.app, 'ana@example.com', 'Ana');

      worker = await startWorker();
      await worker.drain();

      const [request] = receiver.requests;
      const header = request!.headers['opencourse-signature'] as string;
      expect(signatureIsValid(header, newSecret, request!.body)).toBe(true);
      expect(signatureIsValid(header, created.secret, request!.body)).toBe(false);
    });

    it('validates the body', async () => {
      const admin = await setup();
      const post = (body: unknown) => admin.client.post('/api/v1/admin/webhooks', body);
      expect((await post({ url: 'nope', events: ['user.created'] })).statusCode).toBe(400);
      expect((await post({ url: receiver.url, events: [] })).statusCode).toBe(400);
      expect((await post({ url: receiver.url, events: ['video.processed'] })).statusCode).toBe(400);
      expect(
        (await admin.client.patch(`/api/v1/admin/webhooks/${randomUUID()}`, {})).statusCode,
      ).toBe(404);
    });

    it('answers the test action with what the receiver said, and stores nothing', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);

      const ok = await admin.client.post(`/api/v1/admin/webhooks/${endpoint.id}/test`);
      expect(ok.json()).toEqual({ succeeded: true, statusCode: 200, error: null });
      const [request] = receiver.requests;
      expect(request!.headers['opencourse-event']).toBe(WEBHOOK_TEST_EVENT);
      expect(
        signatureIsValid(
          request!.headers['opencourse-signature'] as string,
          endpoint.secret,
          request!.body,
        ),
      ).toBe(true);

      receiver.respond = (_request, response) => response.writeHead(500).end();
      const failed = await admin.client.post(`/api/v1/admin/webhooks/${endpoint.id}/test`);
      expect(failed.json()).toEqual({
        succeeded: false,
        statusCode: 500,
        error: 'Receiver answered 500',
      });
      expect(await deliveries()).toHaveLength(0);
    });

    it('lists the history and retries a failed delivery', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);
      let failing = true;
      receiver.respond = (_request, response) => response.writeHead(failing ? 400 : 200).end();
      await registerClient(ctx.app, 'ana@example.com', 'Ana');
      worker = await startWorker();
      await worker.drain();

      const history = await admin.client.get(`/api/v1/admin/webhooks/${endpoint.id}/deliveries`);
      const [delivery] = history.json().deliveries;
      expect(delivery).toMatchObject({ status: 'failed', attempts: 1, lastStatusCode: 400 });

      // only a failed delivery can be retried
      failing = false;
      const retried = await admin.client.post(
        `/api/v1/admin/webhook-deliveries/${delivery.id}/retry`,
      );
      expect(retried.statusCode).toBe(200);
      await worker.drain();
      expect(await deliveries()).toMatchObject([{ status: 'succeeded', attempts: 2 }]);
      const again = await admin.client.post(
        `/api/v1/admin/webhook-deliveries/${delivery.id}/retry`,
      );
      expect(again.statusCode).toBe(409);
      expect(
        (await admin.client.post(`/api/v1/admin/webhook-deliveries/${randomUUID()}/retry`))
          .statusCode,
      ).toBe(404);
    });

    it('deletes the history with the endpoint', async () => {
      const admin = await setup();
      const endpoint = await createEndpoint(admin);
      await registerClient(ctx.app, 'ana@example.com', 'Ana');
      worker = await startWorker();
      await worker.drain();
      expect(await deliveries()).toHaveLength(1);

      expect((await admin.client.delete(`/api/v1/admin/webhooks/${endpoint.id}`)).statusCode).toBe(
        204,
      );
      expect(await deliveries()).toHaveLength(0);
      expect(
        await ctx.app.db
          .select()
          .from(webhookEndpoints)
          .where(eq(webhookEndpoints.id, endpoint.id)),
      ).toHaveLength(0);
    });
  });
});

describe('webhook URL policy', () => {
  it('requires https unless private networks are allowed', async () => {
    const strict = await createTestApp(
      { WEBHOOKS_ALLOW_PRIVATE_NETWORKS: 'false' },
      { queuePrefix },
    );
    try {
      await resetDatabase(strict.app);
      const admin = await registerClient(strict.app, 'admin@example.com', 'Ada Admin');
      const post = (url: string) =>
        admin.client.post('/api/v1/admin/webhooks', { url, events: ['user.created'] });
      expect((await post('http://example.com/hook')).statusCode).toBe(400);
      expect((await post('https://example.com/hook')).statusCode).toBe(201);
    } finally {
      await strict.app.close();
    }
  });
});
