import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { certificates, outboxEvents } from '../src/db/schema';
import type { Mail } from '../src/mail/mailer';
import { issueCertificate } from '../src/modules/certificates/service';
import { enqueueEvents } from '../src/outbox';
import { relayPendingEvents, type JobData } from '../src/worker/relay';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import {
  createTestApp,
  FakeMailer,
  resetDatabase,
  startTestWorker,
  type TestApp,
  type TestWorker,
} from './helpers';

/** Fails the first `failures` sends, then behaves like the fake mailer. */
class FlakyMailer extends FakeMailer {
  attempts = 0;
  constructor(private failures: number) {
    super();
  }
  override async send(mail: Mail): Promise<void> {
    this.attempts += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('smtp down');
    }
    await super.send(mail);
  }
}

describe('outbox and worker', () => {
  let ctx: TestApp;
  let worker: TestWorker | undefined;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });
  afterEach(async () => {
    await worker?.dispose();
    worker = undefined;
  });

  /** A course with one lesson, a granted student, and a helper that completes the lesson. */
  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, { title: 'Only lesson' });
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    const complete = () =>
      cast.student.client.put(`/api/v1/lessons/${lesson.id}/progress`, { completed: true });
    return { cast, course, lesson, complete };
  }

  const certificateRows = () => ctx.app.db.select().from(certificates);
  const outboxRows = () => ctx.app.db.select().from(outboxEvents);

  describe('writing events', () => {
    const payload = { userId: randomUUID(), courseId: randomUUID() };

    it('keeps nothing when the transaction rolls back and everything when it commits', async () => {
      await expect(
        ctx.app.db.transaction(async (tx) => {
          await enqueueEvents(tx, [{ name: 'course.completed', payload }]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await outboxRows()).toHaveLength(0);

      await ctx.app.db.transaction((tx) =>
        enqueueEvents(tx, [
          { name: 'course.completed', payload },
          { name: 'course.completed', payload },
        ]),
      );
      expect(await outboxRows()).toHaveLength(2);
    });

    it('records the completion events together with the progress row', async () => {
      const { complete } = await setup();
      await complete();
      expect((await outboxRows()).map((row) => row.name).sort()).toEqual([
        'course.completed',
        'lesson.completed',
      ]);
    });
  });

  describe('relay', () => {
    const prefix = `opencourse:test-queue:${randomUUID()}`;
    let connection: Redis;
    let queue: Queue<JobData>;

    beforeAll(() => {
      connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
      queue = new Queue<JobData>('jobs', { connection, prefix });
    });
    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    });

    it('adds one job per consumer and does not duplicate it when delivered twice', async () => {
      const payload = { userId: randomUUID(), courseId: randomUUID() };
      await ctx.app.db.transaction((tx) =>
        enqueueEvents(tx, [
          { name: 'course.completed', payload },
          // nobody consumes lesson.completed yet: it is stamped without a job
          { name: 'lesson.completed', payload: { ...payload, lessonId: randomUUID() } },
        ]),
      );

      expect(await relayPendingEvents(ctx.app.db, queue, 10)).toBe(2);
      expect(await relayPendingEvents(ctx.app.db, queue, 10)).toBe(0);
      expect((await outboxRows()).every((row) => row.dispatchedAt !== null)).toBe(true);
      expect(await queue.getJobCountByTypes('waiting')).toBe(1);

      // a crash between adding the jobs and stamping the rows delivers the same event again
      await ctx.app.db.update(outboxEvents).set({ dispatchedAt: null });
      await relayPendingEvents(ctx.app.db, queue, 10);
      expect(await queue.getJobCountByTypes('waiting')).toBe(1);
    });
  });

  describe('certificate issuance', () => {
    it('announces once and issues once, however often it runs', async () => {
      const { cast, course } = await setup();
      const input = { userId: cast.student.userId, courseId: course.id, announce: true };
      expect(await issueCertificate(ctx.app.db, input)).not.toBeNull();
      expect(await issueCertificate(ctx.app.db, input)).toBeNull();
      expect(await certificateRows()).toHaveLength(1);
      expect((await outboxRows()).filter((row) => row.name === 'certificate.issued')).toHaveLength(
        1,
      );
    });

    it('survives a crash: the worker started later issues the certificate and mails it', async () => {
      const { complete } = await setup();
      // no worker is running when the course is completed
      await complete();
      expect(await certificateRows()).toHaveLength(0);

      worker = await startTestWorker(ctx.mailer);
      await worker.drain();
      const rows = await certificateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailSentAt).not.toBeNull();
      expect(ctx.mailer.sent.map((mail) => mail.to)).toEqual(['sam@example.com']);
    });
  });

  describe('certificate e-mail', () => {
    it('retries a failed send until it goes out, then stamps email_sent_at', async () => {
      const mailer = new FlakyMailer(2);
      worker = await startTestWorker(mailer);
      const { complete } = await setup();
      await complete();
      await worker.drain();

      expect(mailer.attempts).toBe(3);
      expect(mailer.sent).toHaveLength(1);
      expect((await certificateRows())[0]!.emailSentAt).not.toBeNull();
    });

    it('gives up after five attempts and leaves email_sent_at empty', async () => {
      const mailer = new FlakyMailer(Number.POSITIVE_INFINITY);
      worker = await startTestWorker(mailer);
      const { complete } = await setup();
      await complete();
      await worker.drain();

      expect(mailer.attempts).toBe(5);
      const rows = await certificateRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailSentAt).toBeNull();
    });

    it('does not mail again when the certificate was already mailed', async () => {
      worker = await startTestWorker(ctx.mailer);
      ctx.mailer.sent.length = 0;
      const { cast, complete } = await setup();
      await complete();
      await worker.drain();
      expect(ctx.mailer.sent).toHaveLength(1);

      const [row] = await certificateRows();
      // the same event arriving again, as after a crash between sending and stamping elsewhere
      await ctx.app.db.transaction((tx) =>
        enqueueEvents(tx, [
          {
            name: 'certificate.issued',
            payload: {
              userId: cast.student.userId,
              courseId: row!.courseId,
              certificateId: row!.id,
              code: row!.code,
            },
          },
        ]),
      );
      await worker.drain();
      expect(ctx.mailer.sent).toHaveLength(1);
      expect(
        (await ctx.app.db.select().from(certificates).where(eq(certificates.id, row!.id)))[0]!
          .emailSentAt,
      ).not.toBeNull();
    });
  });
});
