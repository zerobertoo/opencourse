import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';

const newWebhook = { url: 'https://example.com/hook', events: ['user.created' as const] };

describe('mock webhook service', () => {
  it('is for admins only', async () => {
    await expect(createTestServices().services.webhooks.list()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const student = (await createServicesSignedInAs('lucas')).services;
    await expect(student.webhooks.list()).rejects.toMatchObject({ code: 'forbidden' });
    const instructor = (await createServicesSignedInAs('rafael')).services;
    await expect(instructor.webhooks.create(newWebhook)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('returns the secret on create and rotate, never on list or update', async () => {
    const { services } = await createServicesSignedInAs('marina');
    const created = await services.webhooks.create(newWebhook);
    expect(created.secret).toMatch(/^whsec_/);
    expect(created).toMatchObject({ active: true, description: '' });

    const [listed] = await services.webhooks.list();
    expect(listed).not.toHaveProperty('secret');
    const updated = await services.webhooks.update(created.id, { active: false });
    expect(updated).toMatchObject({ active: false });
    expect(updated).not.toHaveProperty('secret');

    const rotated = await services.webhooks.rotateSecret(created.id);
    expect(rotated.secret).not.toBe(created.secret);
  });

  it('rejects an invalid webhook', async () => {
    const { services } = await createServicesSignedInAs('marina');
    await expect(services.webhooks.create({ ...newWebhook, url: 'nope' })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(services.webhooks.create({ ...newWebhook, events: [] })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('removes the endpoint with its history', async () => {
    const { services } = await createServicesSignedInAs('marina');
    const created = await services.webhooks.create(newWebhook);
    await services.webhooks.remove(created.id);
    expect(await services.webhooks.list()).toHaveLength(0);
    await expect(services.webhooks.remove(created.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('retries only a failed delivery', async () => {
    const { services } = await createServicesSignedInAs('marina');
    const created = await services.webhooks.create(newWebhook);
    const base = {
      endpointId: created.id,
      eventId: created.id,
      eventName: 'user.created' as const,
      attempts: 1,
      lastStatusCode: 500,
      lastError: null,
      createdAt: '2026-06-15T12:00:00.000Z',
      lastAttemptAt: null,
      deliveredAt: null,
    };
    services.mock.store.mutate((db) => {
      db.webhookDeliveries.push(
        { ...base, id: '11111111-1111-4111-8111-111111111111', status: 'failed' },
        { ...base, id: '22222222-2222-4222-8222-222222222222', status: 'succeeded' },
      );
    });

    expect(await services.webhooks.listDeliveries(created.id)).toHaveLength(2);
    expect(
      await services.webhooks.retryDelivery('11111111-1111-4111-8111-111111111111'),
    ).toMatchObject({ status: 'pending' });
    await expect(
      services.webhooks.retryDelivery('22222222-2222-4222-8222-222222222222'),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
