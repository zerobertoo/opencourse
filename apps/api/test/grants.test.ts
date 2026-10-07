import { grantResponseSchema } from '@opencourse/shared';
import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, grants, users } from '../src/db/schema';
import { hasActiveGrant } from '../src/modules/courses/access';
import { createCast, insertCourse, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

const HOUR_MS = 60 * 60 * 1000;
const inFuture = (hours: number) => new Date(Date.now() + hours * HOUR_MS);

describe('grants', () => {
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

  async function setup(status: 'published' | 'draft' | 'archived' = 'published') {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId, status });
    return { cast, course };
  }

  async function grantsOf(userId: string, courseId: string) {
    return ctx.app.db
      .select()
      .from(grants)
      .where(and(eq(grants.userId, userId), eq(grants.courseId, courseId)));
  }

  describe('POST /grants', () => {
    it('creates a manual grant for the course owner and audits it', async () => {
      const { cast, course } = await setup();
      const expiresAt = inFuture(48).toISOString();
      const response = await cast.instructorA.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt,
      });
      expect(response.statusCode).toBe(201);
      const { grant } = grantResponseSchema.parse(response.json());
      expect(grant).toMatchObject({
        userId: cast.student.userId,
        courseId: course.id,
        source: 'manual',
        createdById: cast.instructorA.userId,
        expiresAt,
        status: 'active',
      });

      const entries = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, grant.id));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: 'grant.created',
        actorId: cast.instructorA.userId,
        targetType: 'grant',
        metadata: { userId: cast.student.userId, courseId: course.id, source: 'manual', expiresAt },
      });
    });

    it('lets an admin grant lifetime access to a draft or archived course', async () => {
      for (const status of ['draft', 'archived'] as const) {
        await resetDatabase(ctx.app);
        const { cast, course } = await setup(status);
        const response = await cast.admin.client.post('/api/v1/grants', {
          userId: cast.student.userId,
          courseId: course.id,
          expiresAt: null,
        });
        expect(response.statusCode).toBe(201);
        expect(response.json().grant.expiresAt).toBeNull();
      }
    });

    it('extends the open grant instead of stacking: 200, same id, requested expiry wins', async () => {
      const { cast, course } = await setup();
      const first = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        expiresAt: inFuture(240),
      });
      const shorter = inFuture(24).toISOString();
      const response = await cast.instructorA.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: shorter,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().grant).toMatchObject({
        id: first.id,
        expiresAt: shorter,
        source: 'manual',
        createdById: cast.admin.userId,
      });
      expect(await grantsOf(cast.student.userId, course.id)).toHaveLength(1);

      const entries = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, first.id));
      expect(entries.map((entry) => entry.action)).toEqual(['grant.extended']);
      expect(entries[0]?.metadata).toMatchObject({
        from: first.expiresAt?.toISOString(),
        to: shorter,
      });
    });

    it('reactivates an expired grant rather than stacking a second one', async () => {
      const { cast, course } = await setup();
      const expired = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        expiresAt: new Date(Date.now() - HOUR_MS),
      });
      const response = await cast.instructorA.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().grant).toMatchObject({
        id: expired.id,
        status: 'active',
        expiresAt: null,
      });
      expect(await grantsOf(cast.student.userId, course.id)).toHaveLength(1);
    });

    it('opens a new grant after the previous one was revoked', async () => {
      const { cast, course } = await setup();
      const revoked = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        revokedAt: new Date(),
      });
      const response = await cast.instructorA.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().grant.id).not.toBe(revoked.id);
      expect(await grantsOf(cast.student.userId, course.id)).toHaveLength(2);
    });

    it('keeps a single open grant when requests race', async () => {
      const { cast, course } = await setup();
      const send = () =>
        cast.instructorA.client.post('/api/v1/grants', {
          userId: cast.student.userId,
          courseId: course.id,
          expiresAt: null,
        });
      const responses = await Promise.all(Array.from({ length: 8 }, send));
      expect(responses.map((response) => response.statusCode).sort()).toEqual([
        200, 200, 200, 200, 200, 200, 200, 201,
      ]);
      expect(await grantsOf(cast.student.userId, course.id)).toHaveLength(1);
    });

    it('rejects a past expiry and answers the same 404 for unknown and deactivated users', async () => {
      const { cast, course } = await setup();
      const post = (body: Record<string, unknown>) =>
        cast.instructorA.client.post('/api/v1/grants', {
          courseId: course.id,
          expiresAt: null,
          ...body,
        });

      const past = await post({
        userId: cast.student.userId,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(past.statusCode).toBe(400);

      await ctx.app.db
        .update(users)
        .set({ active: false })
        .where(eq(users.id, cast.otherStudent.userId));
      const unknown = await post({ userId: randomUUID() });
      const deactivated = await post({ userId: cast.otherStudent.userId });
      expect(unknown.statusCode).toBe(404);
      expect(deactivated.statusCode).toBe(404);
      expect(deactivated.json()).toEqual(unknown.json());

      // an e-mail is not an accepted recipient
      expect((await post({ userId: 'sam@example.com' })).statusCode).toBe(400);
      expect(await ctx.app.db.select().from(grants)).toHaveLength(0);
    });

    it('answers 404 for a course that does not exist', async () => {
      const { cast } = await setup();
      const response = await cast.admin.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: randomUUID(),
        expiresAt: null,
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('revoke and extend', () => {
    async function seedGrant(overrides: { expiresAt?: Date | null; revokedAt?: Date | null } = {}) {
      const { cast, course } = await setup();
      const grant = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        ...overrides,
      });
      return { cast, course, grant };
    }
    const auditActions = async (grantId: string) =>
      (
        await ctx.app.db
          .select()
          .from(auditLog)
          .where(eq(auditLog.targetId, grantId))
          .orderBy(asc(auditLog.createdAt))
      ).map((entry) => entry.action);

    it('revokes a grant, takes access away at once and audits it', async () => {
      const { cast, course, grant } = await seedGrant();
      const readable = await cast.student.client.get(`/api/v1/courses/${course.id}`);
      expect(readable.statusCode).toBe(200);

      const response = await cast.instructorA.client.post(`/api/v1/grants/${grant.id}/revoke`);
      expect(response.statusCode).toBe(200);
      expect(grantResponseSchema.parse(response.json()).grant).toMatchObject({
        id: grant.id,
        status: 'revoked',
      });
      expect(await auditActions(grant.id)).toEqual(['grant.revoked']);
      expect((await cast.student.client.get(`/api/v1/courses/${course.id}`)).statusCode).toBe(403);
      // hasActiveGrant no longer finds it
      const [row] = await ctx.app.db.select().from(grants).where(eq(grants.id, grant.id));
      expect(row?.revokedAt).not.toBeNull();
      expect(await hasActiveGrant(ctx.app.db, cast.student.userId, course.id, new Date())).toBe(
        false,
      );
    });

    it('is idempotent: a second revoke keeps the first timestamp and adds no audit entry', async () => {
      const { cast, grant } = await seedGrant();
      await cast.admin.client.post(`/api/v1/grants/${grant.id}/revoke`);
      const [first] = await ctx.app.db.select().from(grants).where(eq(grants.id, grant.id));
      const again = await cast.admin.client.post(`/api/v1/grants/${grant.id}/revoke`);
      expect(again.statusCode).toBe(200);
      expect(again.json().grant.status).toBe('revoked');
      const [second] = await ctx.app.db.select().from(grants).where(eq(grants.id, grant.id));
      expect(second?.revokedAt).toEqual(first?.revokedAt);
      expect(await auditActions(grant.id)).toEqual(['grant.revoked']);
    });

    it('revokes an expired grant too', async () => {
      const { cast, grant } = await seedGrant({ expiresAt: new Date(Date.now() - HOUR_MS) });
      const response = await cast.admin.client.post(`/api/v1/grants/${grant.id}/revoke`);
      expect(response.json().grant.status).toBe('revoked');
    });

    it('extends to a date, to lifetime, and reactivates an expired grant', async () => {
      const { cast, grant } = await seedGrant({ expiresAt: new Date(Date.now() - HOUR_MS) });
      const date = inFuture(72).toISOString();
      const dated = await cast.instructorA.client.post(`/api/v1/grants/${grant.id}/extend`, {
        expiresAt: date,
      });
      expect(dated.statusCode).toBe(200);
      expect(dated.json().grant).toMatchObject({ id: grant.id, expiresAt: date, status: 'active' });
      const lifetime = await cast.instructorA.client.post(`/api/v1/grants/${grant.id}/extend`, {
        expiresAt: null,
      });
      expect(lifetime.json().grant).toMatchObject({ expiresAt: null, status: 'active' });
      expect(await auditActions(grant.id)).toEqual(['grant.extended', 'grant.extended']);
    });

    it('refuses a past date (400), changing nothing', async () => {
      const { cast, grant } = await seedGrant();
      const past = await cast.admin.client.post(`/api/v1/grants/${grant.id}/extend`, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(past.statusCode).toBe(400);
      expect(await auditActions(grant.id)).toEqual([]);
    });

    it('refuses to extend a revoked grant (409), changing nothing', async () => {
      const { cast, grant } = await seedGrant({ revokedAt: new Date() });
      const response = await cast.admin.client.post(`/api/v1/grants/${grant.id}/extend`, {
        expiresAt: null,
      });
      expect(response.statusCode).toBe(409);
      const [row] = await ctx.app.db.select().from(grants).where(eq(grants.id, grant.id));
      expect(row?.expiresAt).toBeNull();
      expect(row?.revokedAt).not.toBeNull();
      expect(await auditActions(grant.id)).toEqual([]);
    });

    it('answers 404 for an unknown grant id and 400 for a malformed one', async () => {
      const { cast } = await seedGrant();
      const revoke = await cast.admin.client.post(`/api/v1/grants/${randomUUID()}/revoke`);
      expect(revoke.statusCode).toBe(404);
      const extend = await cast.admin.client.post(`/api/v1/grants/${randomUUID()}/extend`, {
        expiresAt: null,
      });
      expect(extend.statusCode).toBe(404);
      expect((await cast.admin.client.post('/api/v1/grants/nope/revoke')).statusCode).toBe(400);
    });
  });

  describe('GET /grants', () => {
    async function seed() {
      const { cast, course } = await setup();
      const other = await insertCourse(ctx.app, { instructorId: cast.instructorB.userId });
      const active = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
      });
      const expired = await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        expiresAt: new Date(Date.now() - HOUR_MS),
      });
      const revoked = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: other.id,
        createdById: cast.admin.userId,
        revokedAt: new Date(),
      });
      // revoked and past its date: must show as revoked, never as expired
      const revokedAndExpired = await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: other.id,
        createdById: cast.admin.userId,
        expiresAt: new Date(Date.now() - HOUR_MS),
        revokedAt: new Date(),
      });
      return { cast, course, other, active, expired, revoked, revokedAndExpired };
    }
    const ids = (response: { json: () => { grants: Array<{ id: string }> } }) =>
      response.json().grants.map((grant) => grant.id);

    it('shows admins every grant and instructors only those of their own courses, newest first', async () => {
      const { cast, active, expired, revoked, revokedAndExpired } = await seed();
      const all = await cast.admin.client.get('/api/v1/grants');
      expect(all.statusCode).toBe(200);
      expect(ids(all)).toEqual([revokedAndExpired.id, revoked.id, expired.id, active.id]);

      expect(ids(await cast.instructorA.client.get('/api/v1/grants'))).toEqual([
        expired.id,
        active.id,
      ]);
      expect(ids(await cast.instructorB.client.get('/api/v1/grants'))).toEqual([
        revokedAndExpired.id,
        revoked.id,
      ]);
    });

    it('reports the effective status and filters by it', async () => {
      const { cast, active, expired, revoked, revokedAndExpired } = await seed();
      const byStatus = async (status: string) =>
        ids(await cast.admin.client.get(`/api/v1/grants?status=${status}`));
      expect(await byStatus('active')).toEqual([active.id]);
      expect(await byStatus('expired')).toEqual([expired.id]);
      expect(await byStatus('revoked')).toEqual([revokedAndExpired.id, revoked.id]);

      const listed = (await cast.admin.client.get('/api/v1/grants')).json().grants;
      expect(listed.map((grant: { status: string }) => grant.status)).toEqual([
        'revoked',
        'revoked',
        'expired',
        'active',
      ]);
      expect((await cast.admin.client.get('/api/v1/grants?status=pending')).statusCode).toBe(400);
    });

    it('filters by course and by user, and never leaks other instructors courses', async () => {
      const { cast, course, other, active } = await seed();
      expect(ids(await cast.admin.client.get(`/api/v1/grants?courseId=${other.id}`))).toHaveLength(
        2,
      );
      expect(
        ids(await cast.admin.client.get(`/api/v1/grants?userId=${cast.student.userId}`)),
      ).toHaveLength(2);
      expect(
        ids(
          await cast.instructorA.client.get(
            `/api/v1/grants?courseId=${course.id}&userId=${cast.student.userId}`,
          ),
        ),
      ).toEqual([active.id]);
      // asking for someone else's course just yields nothing
      const foreign = await cast.instructorA.client.get(`/api/v1/grants?courseId=${other.id}`);
      expect(foreign.statusCode).toBe(200);
      expect(foreign.json()).toEqual({ grants: [] });
    });

    it('is closed to students and anonymous callers, and to a demoted instructor', async () => {
      const { cast } = await seed();
      expect((await cast.student.client.get('/api/v1/grants')).statusCode).toBe(403);
      expect((await new TestClient(ctx.app).get('/api/v1/grants')).statusCode).toBe(401);

      expect((await cast.instructorA.client.get('/api/v1/grants')).statusCode).toBe(200);
      await cast.admin.client.patch(`/api/v1/admin/users/${cast.instructorA.userId}/role`, {
        role: 'student',
      });
      expect((await cast.instructorA.client.get('/api/v1/grants')).statusCode).toBe(403);
    });
  });
});
