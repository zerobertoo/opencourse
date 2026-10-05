import { apiErrorSchema, createInviteResponseSchema, inviteSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { invites } from '../src/db/schema';
import {
  createTestApp,
  extractLink,
  registerClient,
  resetDatabase,
  STRONG_PASSWORD,
  TestClient,
  type TestApp,
} from './helpers';

describe('invites', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    ctx.mailer.sent.length = 0;
  });

  async function createCast() {
    const admin = await registerClient(ctx.app, 'admin@example.com', 'Ada Admin');
    const instructor = await registerClient(ctx.app, 'ines@example.com', 'Ines Instructor');
    const student = await registerClient(ctx.app, 'sam@example.com', 'Sam Student');
    await admin.client.patch(`/api/v1/admin/users/${instructor.userId}/role`, {
      role: 'instructor',
    });
    return { admin, instructor, student };
  }

  /** Creates an invite as the given client and returns the token from the acceptance link. */
  async function invite(client: TestClient, email: string, extra: Record<string, unknown> = {}) {
    const response = await client.post('/api/v1/invites', { email, ...extra });
    expect(response.statusCode).toBe(201);
    const body = createInviteResponseSchema.parse(response.json());
    return { ...body, token: body.acceptUrl.split('/invite/')[1]! };
  }

  it('lets instructors and admins invite, but not students', async () => {
    const { instructor, student } = await createCast();
    expect(
      (await student.client.post('/api/v1/invites', { email: 'x@example.com' })).statusCode,
    ).toBe(403);
    expect(
      (await instructor.client.post('/api/v1/invites', { email: 'x@example.com' })).statusCode,
    ).toBe(201);
  });

  it('returns the link once and e-mails it to the invitee', async () => {
    const { instructor } = await createCast();
    const created = await invite(instructor.client, 'New.Person@Example.com');

    expect(created.invite).toMatchObject({
      email: 'new.person@example.com',
      status: 'pending',
      createdById: instructor.userId,
      courseId: null,
    });
    expect(created.acceptUrl).toBe(`${ctx.config.WEB_BASE_URL}/invite/${created.token}`);

    const mail = ctx.mailer.lastTo('new.person@example.com')!;
    expect(mail.subject).toContain('Ines Instructor');
    expect(extractLink(mail.text)).toBe(created.acceptUrl);

    // listings never expose the token
    const listing = await instructor.client.get('/api/v1/invites');
    expect(listing.body).not.toContain(created.token);
    expect(inviteSchema.parse(listing.json().invites[0]).id).toBe(created.invite.id);
  });

  it('keeps only a hash of the token in the database', async () => {
    const { instructor } = await createCast();
    const created = await invite(instructor.client, 'new@example.com');
    const [row] = await ctx.app.db.select().from(invites).where(eq(invites.id, created.invite.id));
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.tokenHash).not.toBe(created.token);
  });

  it('refuses to invite an address that already has an account, or a past expiry', async () => {
    const { admin } = await createCast();
    const taken = await admin.client.post('/api/v1/invites', { email: 'sam@example.com' });
    expect(taken.statusCode).toBe(409);

    const past = await admin.client.post('/api/v1/invites', {
      email: 'new@example.com',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.statusCode).toBe(400);
  });

  it('shows admins every invite and instructors only their own', async () => {
    const { admin, instructor } = await createCast();
    await invite(admin.client, 'a@example.com');
    await invite(instructor.client, 'b@example.com');

    expect((await admin.client.get('/api/v1/invites')).json().invites).toHaveLength(2);
    const own = (await instructor.client.get('/api/v1/invites')).json().invites;
    expect(own).toHaveLength(1);
    expect(own[0].email).toBe('b@example.com');
  });

  it('filters the listing by course', async () => {
    const { admin } = await createCast();
    const courseId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';
    await invite(admin.client, 'a@example.com', { courseId });
    await invite(admin.client, 'b@example.com');

    const filtered = await admin.client.get(`/api/v1/invites?courseId=${courseId}`);
    expect(filtered.json().invites.map((item: { email: string }) => item.email)).toEqual([
      'a@example.com',
    ]);
  });

  it('shows a pending invite to anyone holding the token', async () => {
    const { instructor } = await createCast();
    const { token } = await invite(instructor.client, 'new@example.com');

    const lookup = await new TestClient(ctx.app).get(`/api/v1/invites/${token}`);
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().invite.email).toBe('new@example.com');

    const unknown = await new TestClient(ctx.app).get('/api/v1/invites/not-a-token');
    expect(unknown.statusCode).toBe(404);
  });

  it('creates a student account, signs them in and closes the invite', async () => {
    const { instructor } = await createCast();
    const { token } = await invite(instructor.client, 'new@example.com');

    const guest = new TestClient(ctx.app);
    const accepted = await guest.post(`/api/v1/invites/${token}/accept`, {
      name: 'New Person',
      password: STRONG_PASSWORD,
      locale: 'en',
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().user).toMatchObject({
      email: 'new@example.com',
      role: 'student',
      locale: 'en',
    });
    expect((await guest.get('/api/v1/me')).statusCode).toBe(200);

    // the invite is spent
    const again = await new TestClient(ctx.app).post(`/api/v1/invites/${token}/accept`, {
      name: 'Someone Else',
      password: STRONG_PASSWORD,
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('Invite is accepted');
    expect((await new TestClient(ctx.app).get(`/api/v1/invites/${token}`)).statusCode).toBe(409);

    const listed = (await instructor.client.get('/api/v1/invites')).json().invites[0];
    expect(listed.status).toBe('accepted');
  });

  it('lets only one of two simultaneous accepts win', async () => {
    const { instructor } = await createCast();
    const { token } = await invite(instructor.client, 'new@example.com');

    const results = await Promise.all(
      [1, 2].map(() =>
        new TestClient(ctx.app).post(`/api/v1/invites/${token}/accept`, {
          name: 'New Person',
          password: STRONG_PASSWORD,
        }),
      ),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  });

  it('treats an expired invite as expired without any cleanup job', async () => {
    const { instructor } = await createCast();
    const { token, invite: created } = await invite(instructor.client, 'new@example.com');
    await ctx.app.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.id, created.id));

    const lookup = await new TestClient(ctx.app).get(`/api/v1/invites/${token}`);
    expect(lookup.statusCode).toBe(409);
    expect(lookup.json().error.message).toBe('Invite is expired');
    const listed = (await instructor.client.get('/api/v1/invites')).json().invites[0];
    expect(listed.status).toBe('expired');
  });

  it('does not burn the invite when the account cannot be created', async () => {
    const { instructor } = await createCast();
    const { token, invite: created } = await invite(instructor.client, 'new@example.com');
    // the address registers on its own between the invitation and the acceptance
    await registerClient(ctx.app, 'new@example.com');

    const accepted = await new TestClient(ctx.app).post(`/api/v1/invites/${token}/accept`, {
      name: 'New Person',
      password: STRONG_PASSWORD,
    });
    expect(accepted.statusCode).toBe(409);
    expect(apiErrorSchema.parse(accepted.json()).error.code).toBe('conflict');

    const [row] = await ctx.app.db.select().from(invites).where(eq(invites.id, created.id));
    expect(row!.status).toBe('pending');
  });

  it('applies the password policy when accepting', async () => {
    const { instructor } = await createCast();
    const { token } = await invite(instructor.client, 'new@example.com');
    const weak = await new TestClient(ctx.app).post(`/api/v1/invites/${token}/accept`, {
      name: 'New Person',
      password: 'short',
    });
    expect(weak.statusCode).toBe(400);
  });
});
