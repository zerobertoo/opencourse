import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consumers, type JobInfo, type WorkerContext } from '../src/worker/consumers';
import { createTestApp, type TestApp } from './helpers';

describe('worker consumers', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('refuses to fan out a job that does not answer a domain event', async () => {
    const fanOut = consumers.find((item) => item.name === 'fan-out-webhooks');
    const job: JobInfo = {
      eventId: randomUUID(),
      eventName: 'webhook.delivery',
      eventCreatedAt: new Date().toISOString(),
      isLastAttempt: true,
    };
    const context = { db: ctx.app.db, addDeliveryJob: async () => {} } as unknown as WorkerContext;

    await expect(Promise.resolve().then(() => fanOut?.run(context, {}, job))).rejects.toThrow(
      /invalid/i,
    );
  });
});
