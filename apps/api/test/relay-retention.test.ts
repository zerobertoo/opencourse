import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxEvents, webhookDeliveries, webhookEndpoints } from '../src/db/schema';
import { purgeDispatchedEvents } from '../src/worker/relay';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('outbox and delivery retention', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  const addEvent = async (dispatchedAt: Date | null) => {
    const [row] = await ctx.app.db
      .insert(outboxEvents)
      .values({ name: 'user.created', payload: { userId: randomUUID() }, dispatchedAt })
      .returning({ id: outboxEvents.id });
    return row!.id;
  };

  it('deletes events dispatched more than a week ago and keeps recent and pending ones', async () => {
    const old = await addEvent(daysAgo(8));
    const recent = await addEvent(daysAgo(6));
    const pending = await addEvent(null);

    await purgeDispatchedEvents(ctx.app.db);

    const remaining = (await ctx.app.db.select({ id: outboxEvents.id }).from(outboxEvents)).map(
      (row) => row.id,
    );
    expect(remaining).toContain(recent);
    expect(remaining).toContain(pending);
    expect(remaining).not.toContain(old);
  });

  it('deletes deliveries created more than a week ago and keeps recent ones', async () => {
    const [endpoint] = await ctx.app.db
      .insert(webhookEndpoints)
      .values({ url: 'https://hooks.example/in', events: ['user.created'], secret: 'whsec_test' })
      .returning({ id: webhookEndpoints.id });
    const delivery = (createdAt: Date) => ({
      endpointId: endpoint!.id,
      eventId: randomUUID(),
      eventName: 'user.created' as const,
      payload: {},
      createdAt,
    });
    const [old] = await ctx.app.db
      .insert(webhookDeliveries)
      .values(delivery(daysAgo(8)))
      .returning({ id: webhookDeliveries.id });
    const [recent] = await ctx.app.db
      .insert(webhookDeliveries)
      .values(delivery(daysAgo(1)))
      .returning({ id: webhookDeliveries.id });

    await purgeDispatchedEvents(ctx.app.db);

    const remaining = (
      await ctx.app.db.select({ id: webhookDeliveries.id }).from(webhookDeliveries)
    ).map((row) => row.id);
    expect(remaining).toEqual([recent!.id]);
    expect(remaining).not.toContain(old!.id);
  });
});
