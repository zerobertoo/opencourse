import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxEvents } from '../src/db/schema';
import { createCast, insertCourse } from './fixtures';
import {
  createTestApp,
  registerClient,
  resetDatabase,
  STRONG_PASSWORD,
  TestClient,
  type TestApp,
} from './helpers';

describe('domain events written by their producers', () => {
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

  async function events(name: string) {
    const rows = await ctx.app.db.select().from(outboxEvents).orderBy(asc(outboxEvents.createdAt));
    return rows.filter((row) => row.name === name).map((row) => row.payload);
  }

  it('writes user.created when someone registers, without the password', async () => {
    const { userId } = await registerClient(ctx.app, 'ana@example.com', 'Ana');
    expect(await events('user.created')).toEqual([
      { userId, name: 'Ana', email: 'ana@example.com', locale: 'pt-BR' },
    ]);
  });

  it('writes user.created and enrollment.granted when an invite is accepted', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const created = await cast.admin.client.post('/api/v1/invites', {
      email: 'new@example.com',
      courseId: course.id,
    });
    const token = created.json().acceptUrl.split('/invite/')[1];
    const accepted = await new TestClient(ctx.app).post(`/api/v1/invites/${token}/accept`, {
      name: 'New Person',
      password: STRONG_PASSWORD,
    });
    const userId = accepted.json().user.id;

    const users = await events('user.created');
    expect(users).toContainEqual(expect.objectContaining({ userId, email: 'new@example.com' }));
    expect(await events('enrollment.granted')).toEqual([
      expect.objectContaining({ userId, courseId: course.id, source: 'invite', expiresAt: null }),
    ]);
  });

  it('writes enrollment.granted for a new grant, not for extending it, and grant.revoked once', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const { admin, student } = cast;

    const granted = await admin.client.post('/api/v1/grants', {
      userId: student.userId,
      courseId: course.id,
      expiresAt: null,
    });
    const grantId = granted.json().grant.id;
    expect(await events('enrollment.granted')).toEqual([
      { grantId, userId: student.userId, courseId: course.id, source: 'manual', expiresAt: null },
    ]);

    // granting again and extending both reuse the open grant: no new enrollment
    await admin.client.post('/api/v1/grants', {
      userId: student.userId,
      courseId: course.id,
      expiresAt: null,
    });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await admin.client.post(`/api/v1/grants/${grantId}/extend`, { expiresAt: future });
    expect(await events('enrollment.granted')).toHaveLength(1);
    expect(await events('grant.revoked')).toHaveLength(0);

    await admin.client.post(`/api/v1/grants/${grantId}/revoke`);
    await admin.client.post(`/api/v1/grants/${grantId}/revoke`);
    expect(await events('grant.revoked')).toEqual([
      { grantId, userId: student.userId, courseId: course.id },
    ]);
  });
});
