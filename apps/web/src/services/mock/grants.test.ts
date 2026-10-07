import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices, FIXED_NOW } from '@/test/mock-services';
import { demoId } from '@/services/mock/seed/ids';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(FIXED_NOW.getTime() + days * DAY_MS).toISOString();

describe('mock grant service', () => {
  describe('list', () => {
    it('requires an instructor or admin', async () => {
      await expect(createTestServices().services.grants.list()).rejects.toMatchObject({
        code: 'unauthorized',
      });
      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(student.grants.list()).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('shows instructors only the grants of their own courses', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const grants = await services.grants.list();
      expect(grants.length).toBeGreaterThan(0);
      expect(new Set(grants.map((grant) => grant.courseId))).toEqual(
        new Set([demoId('course-javascript'), demoId('course-sql')]),
      );
    });

    it('shows admins every grant', async () => {
      const { services } = await createServicesSignedInAs('marina');
      const courseIds = new Set((await services.grants.list()).map((grant) => grant.courseId));
      expect(courseIds.has(demoId('course-design'))).toBe(true);
    });

    it('reports the effective status and filters by it', async () => {
      const { services } = await createServicesSignedInAs('marina');
      const expired = await services.grants.list({ status: 'expired' });
      expect(expired.map((grant) => [grant.userId, grant.courseId])).toEqual([
        [demoId('user-juliana'), demoId('course-javascript')],
      ]);
      expect(await services.grants.list({ status: 'revoked' })).toHaveLength(1);
      const active = await services.grants.list({ status: 'active' });
      expect(active.every((grant) => grant.status === 'active')).toBe(true);
    });

    it('filters by course and by user', async () => {
      const { services } = await createServicesSignedInAs('marina');
      const lucas = await services.grants.list({ userId: demoId('user-lucas') });
      expect(lucas).toHaveLength(3);
      const design = await services.grants.list({ courseId: demoId('course-design') });
      expect(design.every((grant) => grant.courseId === demoId('course-design'))).toBe(true);
    });
  });

  describe('create', () => {
    it('grants lifetime access that the student can use right away', async () => {
      const instructor = await createServicesSignedInAs('rafael');
      const grant = await instructor.services.grants.create({
        userId: demoId('user-gustavo'),
        courseId: demoId('course-javascript'),
        expiresAt: null,
      });
      expect(grant).toMatchObject({
        source: 'manual',
        createdById: demoId('user-rafael'),
        expiresAt: null,
        status: 'active',
      });

      const student = createTestServices({ storage: instructor.storage }).services;
      await student.auth.signIn('gustavo@opencourse.example', 'x');
      expect(await student.enrollments.canAccess(demoId('course-javascript'))).toBe(true);
    });

    it('grants access with an expiration date', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const grant = await services.grants.create({
        userId: demoId('user-gustavo'),
        courseId: demoId('course-javascript'),
        expiresAt: inDays(30),
      });
      expect(grant.expiresAt).toBe(inDays(30));
    });

    it('extends the open grant instead of stacking a second one, expired or not', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const before = await services.grants.list({ courseId: demoId('course-javascript') });
      const extended = await services.grants.create({
        userId: demoId('user-lucas'),
        courseId: demoId('course-javascript'),
        expiresAt: inDays(30),
      });
      expect(extended.expiresAt).toBe(inDays(30));
      expect(before.some((grant) => grant.id === extended.id)).toBe(true);
      const reopened = await services.grants.create({
        userId: demoId('user-juliana'),
        courseId: demoId('course-javascript'),
        expiresAt: null,
      });
      expect(reopened).toMatchObject({ status: 'active', expiresAt: null });
      const after = await services.grants.list({ courseId: demoId('course-javascript') });
      expect(
        after.filter((grant) => grant.userId === reopened.userId && grant.status !== 'revoked'),
      ).toHaveLength(1);
      expect(after).toHaveLength(before.length);
    });

    it('validates user, course and expiration', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      await expect(
        services.grants.create({
          userId: demoId('user-gustavo'),
          courseId: demoId('course-javascript'),
          expiresAt: inDays(-1),
        }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.grants.create({
          userId: demoId('user-gustavo'),
          courseId: demoId('course-javascript'),
          expiresAt: 'ontem',
        }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.grants.create({
          userId: 'ninguem',
          courseId: demoId('course-javascript'),
          expiresAt: null,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        services.grants.create({
          userId: demoId('user-gustavo'),
          courseId: 'ninguem',
          expiresAt: null,
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('is forbidden for students and for instructors of other courses', async () => {
      const input = {
        userId: demoId('user-gustavo'),
        courseId: demoId('course-javascript'),
        expiresAt: null,
      };
      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(student.grants.create(input)).rejects.toMatchObject({ code: 'forbidden' });
      const other = (await createServicesSignedInAs('beatriz')).services;
      await expect(other.grants.create(input)).rejects.toMatchObject({ code: 'forbidden' });
      const admin = (await createServicesSignedInAs('marina')).services;
      await expect(admin.grants.create(input)).resolves.toBeDefined();
    });
  });

  describe('revoke and extend', () => {
    it('revokes a grant and removes the access', async () => {
      const instructor = await createServicesSignedInAs('rafael');
      const [grant] = await instructor.services.grants.list({
        userId: demoId('user-camila'),
        courseId: demoId('course-sql'),
      });
      const revoked = await instructor.services.grants.revoke(grant!.id);
      expect(revoked.status).toBe('revoked');

      const student = createTestServices({ storage: instructor.storage }).services;
      await student.auth.signIn('camila@opencourse.example', 'x');
      expect(await student.enrollments.canAccess(demoId('course-sql'))).toBe(false);
    });

    it('fails to revoke an unknown grant and respects course ownership', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      await expect(services.grants.revoke(demoId('grant-inexistente'))).rejects.toMatchObject({
        code: 'not_found',
      });

      const other = (await createServicesSignedInAs('beatriz')).services;
      const [grant] = await (
        await createServicesSignedInAs('rafael')
      ).services.grants.list({
        courseId: demoId('course-javascript'),
      });
      await expect(other.grants.revoke(grant!.id)).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('extends an active grant and can make it lifetime', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const [grant] = await services.grants.list({
        userId: demoId('user-camila'),
        courseId: demoId('course-javascript'),
      });
      expect(grant?.expiresAt).not.toBeNull();

      const extended = await services.grants.extend(grant!.id, inDays(365));
      expect(extended.expiresAt).toBe(inDays(365));
      const lifetime = await services.grants.extend(grant!.id, null);
      expect(lifetime.expiresAt).toBeNull();
    });

    it('reactivates an expired grant when it is extended', async () => {
      const instructor = await createServicesSignedInAs('rafael');
      const [expired] = await instructor.services.grants.list({ status: 'expired' });
      const extended = await instructor.services.grants.extend(expired!.id, inDays(30));
      expect(extended.status).toBe('active');

      const student = createTestServices({ storage: instructor.storage }).services;
      await student.auth.signIn('juliana@opencourse.example', 'x');
      expect(await student.enrollments.canAccess(demoId('course-javascript'))).toBe(true);
    });

    it('does not extend a revoked grant nor accept a past date', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const [revoked] = await services.grants.list({ status: 'revoked' });
      await expect(services.grants.extend(revoked!.id, inDays(30))).rejects.toMatchObject({
        code: 'conflict',
      });

      const [active] = await services.grants.list({ status: 'active' });
      await expect(services.grants.extend(active!.id, inDays(-2))).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });

  describe('invites', () => {
    it('creates an invite valid for 14 days by default, tied to a course', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const { invite, acceptUrl } = await services.grants.createInvite({
        email: '  Nova.Pessoa@Exemplo.dev ',
        courseId: demoId('course-javascript'),
      });
      expect(invite).toMatchObject({
        email: 'nova.pessoa@exemplo.dev',
        courseId: demoId('course-javascript'),
        status: 'pending',
        createdById: demoId('user-rafael'),
        expiresAt: inDays(14),
      });
      expect(acceptUrl).toMatch(/\/invite\/.{8,}$/);
      expect(invite).not.toHaveProperty('token');

      const another = await services.grants.createInvite({ email: 'outra@exemplo.dev' });
      expect(another.acceptUrl).not.toBe(acceptUrl);
      expect(another.invite.courseId).toBeNull();
    });

    it('creates an invite that can be accepted by the new user', async () => {
      const instructor = await createServicesSignedInAs('rafael');
      const { acceptUrl } = await instructor.services.grants.createInvite({
        email: 'recem.chegado@exemplo.dev',
        courseId: demoId('course-javascript'),
      });

      const guest = createTestServices({ storage: instructor.storage }).services;
      await guest.auth.signOut();
      await guest.auth.acceptInvite(acceptUrl.split('/invite/')[1]!, {
        name: 'Recém Chegado',
        password: 'senha-segura',
      });
      expect((await guest.enrollments.listMyCourses()).map((c) => c.course.id)).toEqual([
        demoId('course-javascript'),
      ]);
    });

    it('validates email, expiration and permissions', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      await expect(services.grants.createInvite({ email: 'invalido' })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(
        services.grants.createInvite({ email: 'a@b.com', expiresAt: inDays(-1) }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.grants.createInvite({ email: 'a@b.com', courseId: demoId('course-design') }),
      ).rejects.toMatchObject({ code: 'forbidden' });

      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(student.grants.createInvite({ email: 'a@b.com' })).rejects.toMatchObject({
        code: 'forbidden',
      });
    });

    it('lists invites with the effective status and scoped to the instructor', async () => {
      const instructor = (await createServicesSignedInAs('rafael')).services;
      const mine = await instructor.grants.listInvites();
      expect(mine.map((invite) => [invite.id, invite.status]).sort()).toEqual(
        [
          [demoId('invite-1'), 'pending'],
          [demoId('invite-3'), 'expired'],
        ].sort(),
      );
      expect(await instructor.grants.listInvites({ courseId: demoId('course-sql') })).toHaveLength(
        1,
      );

      const admin = (await createServicesSignedInAs('marina')).services;
      expect(await admin.grants.listInvites()).toHaveLength(3);
    });
  });
});
