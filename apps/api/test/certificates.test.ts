import {
  apiErrorSchema,
  certificateCodeSchema,
  type CertificateIssuedEvent,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, certificates, courses, courseTranslations } from '../src/db/schema';
import { backfillCertificates } from '../src/modules/certificates/backfill';
import { issueCertificate } from '../src/modules/certificates/service';
import {
  createCast,
  insertCourse,
  insertGrant,
  insertLesson,
  insertModule,
  insertProgress,
} from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

/** Lets the bus deliver and the background e-mail finish. */
async function settle(ctx: TestApp) {
  await new Promise((resolve) => setImmediate(resolve));
  await ctx.app.settleBackgroundTasks();
  await new Promise((resolve) => setImmediate(resolve));
  await ctx.app.settleBackgroundTasks();
}

describe('certificates', () => {
  let ctx: TestApp;
  const announced: CertificateIssuedEvent[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.app.events.on('certificate.issued', (event) => {
      announced.push(event);
    });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    announced.length = 0;
    ctx.mailer.sent.length = 0;
  });

  /** A course with one lesson and a granted student. */
  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      title: 'Design basics',
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, { title: 'Only lesson' });
    const grant = await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    return { cast, course, courseModule, lesson, grant };
  }

  const mark = (client: TestClient, lessonId: string, completed: boolean) =>
    client.put(`/api/v1/lessons/${lessonId}/progress`, { completed });

  const rowsOf = () => ctx.app.db.select().from(certificates);

  describe('issuing', () => {
    it('issues one certificate when the last lesson is completed', async () => {
      const { cast, lesson, course } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);

      const rows = await rowsOf();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: cast.student.userId,
        courseId: course.id,
        holderName: 'Sam Student',
        courseTitles: { en: 'Design basics' },
        defaultLocale: 'en',
        template: { signatoryName: 'Ines', signatoryRole: '', message: '' },
      });
      expect(certificateCodeSchema.safeParse(rows[0]!.code).success).toBe(true);
      expect(announced).toEqual([
        {
          userId: cast.student.userId,
          courseId: course.id,
          certificateId: rows[0]!.id,
          code: rows[0]!.code,
        },
      ]);
    });

    it('does not issue again when the lesson is un-completed and completed again', async () => {
      const { cast, lesson } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      await mark(cast.student.client, lesson.id, false);
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);

      expect(await rowsOf()).toHaveLength(1);
      expect(announced).toHaveLength(1);
      expect(ctx.mailer.sent).toHaveLength(1);
    });

    it('issues nothing when the course turned certificates off', async () => {
      const { cast, lesson, course } = await setup();
      await ctx.app.db
        .update(courses)
        .set({
          certificateTemplate: {
            enabled: false,
            signatoryName: '',
            signatoryRole: '',
            message: '',
          },
        })
        .where(eq(courses.id, course.id));
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      expect(await rowsOf()).toHaveLength(0);
      expect(announced).toHaveLength(0);
    });

    it('keeps the certificate when a lesson is added later and when the grant is revoked', async () => {
      const { cast, lesson, courseModule, grant } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      await insertLesson(ctx.app, courseModule.id, 1, { title: 'Added later' });
      await cast.instructorA.client.post(`/api/v1/grants/${grant.id}/revoke`);

      const listed = await cast.student.client.get('/api/v1/me/certificates');
      expect(listed.statusCode).toBe(200);
      expect(listed.json().certificates).toHaveLength(1);
      expect(await rowsOf()).toHaveLength(1);
    });

    it('freezes the name, titles and template at issue time', async () => {
      const { cast, lesson, course } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      const [issued] = await rowsOf();

      await cast.student.client.patch('/api/v1/me', { name: 'Renamed Person' });
      await ctx.app.db
        .update(courseTranslations)
        .set({ title: 'New title' })
        .where(eq(courseTranslations.courseId, course.id));
      await ctx.app.db
        .update(courses)
        .set({
          certificateTemplate: {
            enabled: true,
            signatoryName: 'Other',
            signatoryRole: '',
            message: 'x',
          },
        })
        .where(eq(courses.id, course.id));

      const response = await new TestClient(ctx.app).get(
        `/api/v1/certificates/verify/${issued!.code}`,
      );
      expect(response.json()).toMatchObject({
        holderName: 'Sam Student',
        courseTitles: { en: 'Design basics' },
        template: { signatoryName: 'Ines' },
      });
    });

    it('draws another code when the first one is taken', async () => {
      const { cast, lesson, course } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      const [taken] = await rowsOf();

      const codes = [taken!.code, 'OC-ABCD-EFGH'];
      const issued = await issueCertificate(ctx.app.db, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        generateCode: () => codes.shift()!,
      });
      expect(issued?.code).toBe('OC-ABCD-EFGH');
    });

    it('records an audit entry without an actor', async () => {
      const { cast, lesson } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      const [row] = await rowsOf();
      const entries = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'certificate.issued'));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorId: null,
        targetType: 'certificate',
        targetId: row!.id,
      });
    });
  });

  describe('e-mail', () => {
    it('tells the student and records when it went out', async () => {
      const { cast, lesson } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);

      const mail = ctx.mailer.lastTo('sam@example.com');
      expect(mail?.subject).toContain('Design basics');
      expect((await rowsOf())[0]!.emailSentAt).not.toBeNull();
    });

    it('still issues when the e-mail fails and leaves email_sent_at empty', async () => {
      const { cast, lesson } = await setup();
      const original = ctx.mailer.send.bind(ctx.mailer);
      ctx.mailer.send = async () => {
        throw new Error('smtp down');
      };
      try {
        await mark(cast.student.client, lesson.id, true);
        await settle(ctx);
      } finally {
        ctx.mailer.send = original;
      }
      const rows = await rowsOf();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailSentAt).toBeNull();
    });
  });

  describe('routes', () => {
    it('lists only the caller’s certificates, newest first, and needs a session', async () => {
      const { cast, lesson } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);

      const mine = await cast.student.client.get('/api/v1/me/certificates');
      expect(mine.json().certificates).toHaveLength(1);
      const others = await cast.otherStudent.client.get('/api/v1/me/certificates');
      expect(others.json().certificates).toEqual([]);
      expect((await new TestClient(ctx.app).get('/api/v1/me/certificates')).statusCode).toBe(401);
    });

    it('verifies a code publicly, normalizes it, and exposes no ids or e-mail', async () => {
      const { cast, lesson } = await setup();
      await mark(cast.student.client, lesson.id, true);
      await settle(ctx);
      const [row] = await rowsOf();
      const anonymous = new TestClient(ctx.app);

      const response = await anonymous.get(
        `/api/v1/certificates/verify/${encodeURIComponent(` ${row!.code.toLowerCase()} `)}`,
      );
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.code).toBe(row!.code);
      expect(body.holderName).toBe('Sam Student');
      expect(JSON.stringify(body)).not.toContain('sam@example.com');
      expect(JSON.stringify(body)).not.toContain(cast.student.userId);
      expect(Object.keys(body)).not.toContain('userId');
    });

    it('answers the same 404 for malformed and unknown codes', async () => {
      const anonymous = new TestClient(ctx.app);
      const unknown = await anonymous.get('/api/v1/certificates/verify/OC-ABCD-EFGH');
      const malformed = await anonymous.get('/api/v1/certificates/verify/nonsense');
      const tooLong = await anonymous.get(`/api/v1/certificates/verify/${'A'.repeat(90)}`);
      expect(tooLong.statusCode).toBe(404);
      expect(unknown.statusCode).toBe(404);
      expect(malformed.statusCode).toBe(404);
      expect(apiErrorSchema.parse(malformed.json())).toEqual(apiErrorSchema.parse(unknown.json()));
    });
  });

  describe('backfill', () => {
    it('issues past completions once, silently, and marks the audit entry', async () => {
      const { cast, lesson } = await setup();
      await insertProgress(ctx.app, { userId: cast.student.userId, lessonId: lesson.id });

      expect(await backfillCertificates(ctx.app.db)).toBe(1);
      expect(await backfillCertificates(ctx.app.db)).toBe(0);
      await settle(ctx);

      expect(await rowsOf()).toHaveLength(1);
      expect(announced).toHaveLength(0);
      expect(ctx.mailer.sent).toHaveLength(0);
      const [entry] = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'certificate.issued'));
      expect(entry!.metadata).toMatchObject({ backfill: true });
    });

    it('skips students who have not finished', async () => {
      await setup();
      expect(await backfillCertificates(ctx.app.db)).toBe(0);
    });
  });
});

describe('certificate verification rate limit', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp({ RATE_LIMIT_DISABLED: 'false' });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    const keys = await ctx.app.redis.keys('opencourse:rl:*');
    if (keys.length > 0) await ctx.app.redis.del(...keys);
  });

  it('answers 429 after too many lookups from one client', async () => {
    const client = new TestClient(ctx.app);
    for (let index = 0; index < 30; index += 1) {
      expect((await client.get('/api/v1/certificates/verify/OC-ABCD-EFGH')).statusCode).toBe(404);
    }
    expect((await client.get('/api/v1/certificates/verify/OC-ABCD-EFGH')).statusCode).toBe(429);
  });
});
