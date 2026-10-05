import { apiErrorSchema, auditLogEntrySchema } from '@opencourse/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import {
  createTestApp,
  registerClient,
  resetDatabase,
  STRONG_PASSWORD,
  TestClient,
  type TestApp,
} from './helpers';

describe('user administration', () => {
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

  /** An admin, an instructor and a student, in that order. */
  async function createCast() {
    const admin = await registerClient(ctx.app, 'admin@example.com', 'Ada Admin');
    const instructor = await registerClient(ctx.app, 'ines@example.com', 'Ines Instructor');
    const student = await registerClient(ctx.app, 'sam@example.com', 'Sam Student');
    const promoted = await admin.client.patch(`/api/v1/admin/users/${instructor.userId}/role`, {
      role: 'instructor',
    });
    expect(promoted.statusCode).toBe(200);
    return { admin, instructor, student };
  }

  it('lets admins and instructors list and filter users, but not students', async () => {
    const { admin, instructor, student } = await createCast();

    const all = await admin.client.get('/api/v1/admin/users');
    expect(all.json().users.map((user: { name: string }) => user.name)).toEqual([
      'Ada Admin',
      'Ines Instructor',
      'Sam Student',
    ]);
    expect(all.body).not.toMatch(/passwordHash|password_hash/);

    const byRole = await instructor.client.get('/api/v1/admin/users?role=student');
    expect(byRole.json().users).toHaveLength(1);
    const bySearch = await admin.client.get('/api/v1/admin/users?search=INES');
    expect(bySearch.json().users[0].email).toBe('ines@example.com');
    // LIKE wildcards in the search text are literal characters
    const wildcard = await admin.client.get('/api/v1/admin/users?search=%25');
    expect(wildcard.json().users).toHaveLength(0);

    expect((await student.client.get('/api/v1/admin/users')).statusCode).toBe(403);
    expect((await new TestClient(ctx.app).get('/api/v1/admin/users')).statusCode).toBe(401);
  });

  it('filters by active state', async () => {
    const { admin, student } = await createCast();
    await admin.client.patch(`/api/v1/admin/users/${student.userId}/active`, { active: false });

    const inactive = await admin.client.get('/api/v1/admin/users?active=false');
    expect(inactive.json().users.map((user: { id: string }) => user.id)).toEqual([student.userId]);
  });

  it('only admins change roles, and every change is audited', async () => {
    const { admin, instructor, student } = await createCast();

    const byInstructor = await instructor.client.patch(
      `/api/v1/admin/users/${student.userId}/role`,
      { role: 'admin' },
    );
    expect(byInstructor.statusCode).toBe(403);

    const changed = await admin.client.patch(`/api/v1/admin/users/${student.userId}/role`, {
      role: 'instructor',
    });
    expect(changed.json().user.role).toBe('instructor');
    // the new role applies on the very next request, no token refresh needed
    expect((await student.client.get('/api/v1/admin/users')).statusCode).toBe(200);

    const audit = await admin.client.get('/api/v1/admin/audit');
    const entries = audit.json().entries.map((entry: unknown) => auditLogEntrySchema.parse(entry));
    expect(entries[0]).toMatchObject({
      action: 'user.role_changed',
      targetId: student.userId,
      metadata: { from: 'student', to: 'instructor' },
    });
    expect((await instructor.client.get('/api/v1/admin/audit')).statusCode).toBe(403);
  });

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const { admin } = await createCast();
    const missing = await admin.client.patch(
      '/api/v1/admin/users/00000000-0000-4000-8000-000000000000/role',
      { role: 'student' },
    );
    expect(missing.statusCode).toBe(404);
    const malformed = await admin.client.patch('/api/v1/admin/users/not-a-uuid/role', {
      role: 'student',
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('never leaves the platform without an active admin', async () => {
    const { admin } = await createCast();

    const demote = await admin.client.patch(`/api/v1/admin/users/${admin.userId}/role`, {
      role: 'student',
    });
    expect(demote.statusCode).toBe(409);
    expect(apiErrorSchema.parse(demote.json()).error.code).toBe('conflict');
    const deactivate = await admin.client.patch(`/api/v1/admin/users/${admin.userId}/active`, {
      active: false,
    });
    expect(deactivate.statusCode).toBe(409);

    // with a second admin, the first can step down
    const second = await registerClient(ctx.app, 'second.admin@example.com');
    await admin.client.patch(`/api/v1/admin/users/${second.userId}/role`, { role: 'admin' });
    const stepDown = await admin.client.patch(`/api/v1/admin/users/${admin.userId}/role`, {
      role: 'student',
    });
    expect(stepDown.statusCode).toBe(200);
  });

  it('cannot remove the last admin even when two admins demote each other at once', async () => {
    const { admin } = await createCast();
    const second = await registerClient(ctx.app, 'second.admin@example.com');
    await admin.client.patch(`/api/v1/admin/users/${second.userId}/role`, { role: 'admin' });

    const results = await Promise.all([
      admin.client.patch(`/api/v1/admin/users/${second.userId}/role`, { role: 'student' }),
      second.client.patch(`/api/v1/admin/users/${admin.userId}/role`, { role: 'student' }),
    ]);

    // one demotion wins; the loser is refused (409 by the guard, or 403 if it already lost its
    // admin role before the request was checked). What must never happen is both succeeding.
    const codes = results.map((result) => result.statusCode);
    expect(codes.filter((code) => code === 200)).toHaveLength(1);
    expect(codes.filter((code) => code === 409 || code === 403)).toHaveLength(1);

    const stillAdmin = await ctx.app.db
      .select()
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)));
    expect(stillAdmin).toHaveLength(1);
  });

  it('signs a deactivated user out everywhere and blocks new sign-ins', async () => {
    const { admin, student } = await createCast();
    expect((await student.client.get('/api/v1/me')).statusCode).toBe(200);

    await admin.client.patch(`/api/v1/admin/users/${student.userId}/active`, { active: false });
    expect((await student.client.get('/api/v1/me')).statusCode).toBe(401);
    expect((await student.client.post('/api/v1/auth/refresh')).statusCode).toBe(401);

    await admin.client.patch(`/api/v1/admin/users/${student.userId}/active`, { active: true });
    const login = await new TestClient(ctx.app).post('/api/v1/auth/login', {
      email: 'sam@example.com',
      password: STRONG_PASSWORD,
    });
    expect(login.statusCode).toBe(200);

    const actions = (await admin.client.get('/api/v1/admin/audit'))
      .json()
      .entries.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['user.deactivated', 'user.reactivated']));
  });

  it('protects personal data: students can read only themselves', async () => {
    const { admin, instructor, student } = await createCast();

    expect((await student.client.get(`/api/v1/users/${student.userId}`)).statusCode).toBe(200);
    expect((await student.client.get(`/api/v1/users/${admin.userId}`)).statusCode).toBe(403);
    expect((await instructor.client.get(`/api/v1/users/${student.userId}`)).statusCode).toBe(200);
    expect((await admin.client.get(`/api/v1/users/${student.userId}`)).statusCode).toBe(200);
  });

  it('paginates the audit log, newest first', async () => {
    const { admin, student } = await createCast();
    await admin.client.patch(`/api/v1/admin/users/${student.userId}/active`, { active: false });

    const page = await admin.client.get('/api/v1/admin/audit?limit=1');
    expect(page.json().entries).toHaveLength(1);
    expect(page.json().entries[0].action).toBe('user.deactivated');
    const next = await admin.client.get('/api/v1/admin/audit?limit=1&offset=1');
    expect(next.json().entries[0].action).toBe('user.role_changed');
    expect((await admin.client.get('/api/v1/admin/audit?limit=9999')).statusCode).toBe(400);
  });
});
