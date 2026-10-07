import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, grants } from '../src/db/schema';
import { createCast, insertCourse, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

interface Target {
  courseId: string;
  grantId: string;
  userId: string;
}

interface Route {
  name: string;
  url: (target: Target) => string;
  body?: (target: Target) => unknown;
}

/** Every grant mutation, aimed at one course and one of its grants. */
const routes: Route[] = [
  {
    name: 'create',
    url: () => '/api/v1/grants',
    body: (t) => ({ userId: t.userId, courseId: t.courseId, expiresAt: null }),
  },
  { name: 'revoke', url: (t) => `/api/v1/grants/${t.grantId}/revoke` },
  {
    name: 'extend',
    url: (t) => `/api/v1/grants/${t.grantId}/extend`,
    body: () => ({ expiresAt: null }),
  },
];

describe('grant authorization', () => {
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

  async function setup() {
    const cast = await createCast(ctx.app);
    const target = async (status: 'published' | 'draft'): Promise<Target> => {
      const course = await insertCourse(ctx.app, {
        instructorId: cast.instructorA.userId,
        status,
      });
      // a grant of otherStudent, so that `create` for the student is a new grant
      const grant = await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        createdById: cast.admin.userId,
        expiresAt: new Date(Date.now() + 3600_000),
      });
      return { courseId: course.id, grantId: grant.id, userId: cast.student.userId };
    };
    const published = await target('published');
    const draft = await target('draft');
    const unknown: Target = {
      courseId: randomUUID(),
      grantId: randomUUID(),
      userId: cast.student.userId,
    };
    return { cast, published, draft, unknown };
  }

  async function state() {
    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      grants: byId(await ctx.app.db.select().from(grants)),
      audit: byId(await ctx.app.db.select().from(auditLog)),
    };
  }

  it.each(routes)(
    '$name: strangers are refused, ids never leak, nothing changes',
    async (route) => {
      const { cast, published, draft, unknown } = await setup();
      const call = (client: TestClient, target: Target) =>
        client.post(route.url(target), route.body?.(target));
      const before = await state();

      // visible but not theirs: 403, the granted student and plain students included
      expect((await call(cast.instructorB.client, published)).statusCode).toBe(403);
      expect((await call(cast.otherStudent.client, published)).statusCode).toBe(403);
      expect((await call(cast.student.client, published)).statusCode).toBe(403);
      // a draft of someone else looks exactly like an id that does not exist
      const hidden = await call(cast.instructorB.client, draft);
      const missing = await call(cast.instructorB.client, unknown);
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual(missing.json());
      expect((await call(cast.student.client, draft)).statusCode).toBe(404);
      expect((await call(new TestClient(ctx.app), published)).statusCode).toBe(401);

      expect(await state()).toEqual(before);

      // the owner and an admin may act on the draft
      expect([200, 201]).toContain((await call(cast.instructorA.client, draft)).statusCode);
      expect([200, 201]).toContain((await call(cast.admin.client, draft)).statusCode);
    },
  );

  it('refuses an instructor demoted to student on every grant route, at once', async () => {
    const { cast, published } = await setup();
    const demoted = await cast.admin.client.patch(
      `/api/v1/admin/users/${cast.instructorA.userId}/role`,
      { role: 'student' },
    );
    expect(demoted.statusCode).toBe(200);
    for (const route of routes) {
      const response = await cast.instructorA.client.post(
        route.url(published),
        route.body?.(published),
      );
      expect(response.statusCode).toBe(403);
    }
  });

  it('keeps a revoke racing an extend consistent: revoked, one revoke entry, extend audited only if it succeeded', async () => {
    const { cast, published } = await setup();
    const [revoke, extend] = await Promise.all([
      cast.admin.client.post(`/api/v1/grants/${published.grantId}/revoke`),
      cast.admin.client.post(`/api/v1/grants/${published.grantId}/extend`, { expiresAt: null }),
    ]);
    expect(revoke.statusCode).toBe(200);
    expect([200, 409]).toContain(extend.statusCode);

    const [row] = await ctx.app.db.select().from(grants).where(eq(grants.id, published.grantId));
    expect(row?.revokedAt).not.toBeNull();
    const actions = (
      await ctx.app.db.select().from(auditLog).where(eq(auditLog.targetId, published.grantId))
    ).map((entry) => entry.action);
    expect(actions.filter((action) => action === 'grant.revoked')).toHaveLength(1);
    // a refused extend leaves no audit entry behind
    expect(actions.filter((action) => action === 'grant.extended')).toHaveLength(
      extend.statusCode === 200 ? 1 : 0,
    );
  });
});
