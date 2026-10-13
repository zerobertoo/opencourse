import {
  attachmentDownloadResponseSchema,
  createAttachmentResponseSchema,
  DEFAULT_ATTACHMENT_MAX_BYTES,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lessonAttachments } from '../src/db/schema';
import { lessonFileKeys, removeStaleAttachments } from '../src/modules/files/service';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, type TestApp, type TestClient } from './helpers';

const WEBVTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';
const SRT = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n';

describe('lesson attachments and captions', () => {
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

  async function setup(
    lessonType: 'video' | 'text' = 'video',
    status: 'draft' | 'published' = 'published',
  ) {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId, status });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Lesson',
      type: lessonType,
    });
    return { cast, course, courseModule, lesson };
  }

  async function grantStudent(cast: Awaited<ReturnType<typeof setup>>['cast'], courseId: string) {
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId,
      createdById: cast.admin.userId,
    });
  }

  /** What the web app does: ask for an address, PUT the file, report it done. */
  async function sendAttachment(
    client: TestClient,
    lessonId: string,
    file: Buffer,
    options: { filename?: string; contentType?: string; announcedSize?: number } = {},
  ) {
    const contentType = options.contentType ?? 'application/pdf';
    const started = await client.post(`/api/v1/lessons/${lessonId}/attachments`, {
      filename: options.filename ?? 'notes.pdf',
      contentType,
      sizeBytes: options.announcedSize ?? file.length,
    });
    expect(started.statusCode).toBe(200);
    const { attachmentId, uploadUrl } = createAttachmentResponseSchema.parse(started.json());
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: file,
    });
    expect(put.status).toBe(200);
    const completed = await client.post(
      `/api/v1/lessons/${lessonId}/attachments/${attachmentId}/complete`,
    );
    return { attachmentId, completed };
  }

  it('uploads an attachment, lists it and sends it to a student with a grant as a download', async () => {
    const { cast, course, lesson } = await setup('text');
    const file = Buffer.from('%PDF-1.4 fake pdf bytes');
    const { attachmentId, completed } = await sendAttachment(
      cast.instructorA.client,
      lesson.id,
      file,
      { filename: 'dir/Aula ç 1.pdf' },
    );
    expect(completed.statusCode).toBe(200);
    expect(completed.json().attachment).toMatchObject({
      id: attachmentId,
      name: 'Aula ç 1.pdf',
      sizeBytes: file.length,
      url: `/api/v1/attachments/${attachmentId}/download`,
    });

    // a student without a grant is refused, with one the file is a forced download
    const downloadPath = `/api/v1/attachments/${attachmentId}/download`;
    expect((await cast.student.client.get(downloadPath)).statusCode).toBe(403);
    await grantStudent(cast, course.id);

    const detail = await cast.student.client.get(`/api/v1/courses/${course.id}`);
    expect(detail.json().course.modules[0].lessons[0].attachments).toEqual([
      { id: attachmentId, name: 'Aula ç 1.pdf', sizeBytes: file.length, url: downloadPath },
    ]);

    const answer = await cast.student.client.get(downloadPath);
    expect(answer.statusCode).toBe(200);
    const stored = await fetch(attachmentDownloadResponseSchema.parse(answer.json()).url);
    expect(stored.status).toBe(200);
    expect(stored.headers.get('content-disposition')).toMatch(/^attachment; filename=/);
    expect(stored.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''Aula%20%C3%A7%201.pdf",
    );
    expect(Buffer.from(await stored.arrayBuffer()).equals(file)).toBe(true);
  });

  it('refuses a file above the limit', async () => {
    const { cast, lesson } = await setup('text');
    const tooBig = await cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/attachments`, {
      filename: 'big.zip',
      contentType: 'application/zip',
      sizeBytes: DEFAULT_ATTACHMENT_MAX_BYTES + 1,
    });
    expect(tooBig.statusCode).toBe(400);
  });

  it('has the storage refuse a body of another size than the one announced', async () => {
    const { cast, lesson } = await setup('text');
    const started = await cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/attachments`, {
      filename: 'small.txt',
      contentType: 'text/plain',
      sizeBytes: 5,
    });
    const { uploadUrl } = createAttachmentResponseSchema.parse(started.json());
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'far more than five bytes',
    });
    expect(response.ok).toBe(false);
  });

  it('drops attachments whose upload was never confirmed after a day', async () => {
    const { cast, lesson } = await setup('text');
    const started = await cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/attachments`, {
      filename: 'late.txt',
      contentType: 'text/plain',
      sizeBytes: 3,
    });
    const { attachmentId, uploadUrl } = createAttachmentResponseSchema.parse(started.json());
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'abc',
    });
    const log = { warn: () => undefined };

    expect(await removeStaleAttachments(ctx.app.db, ctx.app.storage, log)).toBe(0);
    const later = new Date(Date.now() + 25 * 3600 * 1000);
    expect(await removeStaleAttachments(ctx.app.db, ctx.app.storage, log, later)).toBe(1);
    expect(await ctx.app.db.select().from(lessonAttachments)).toHaveLength(0);
    expect(
      await ctx.app.storage.sizeOf(lessonFileKeys.attachment(lesson.id, attachmentId)),
    ).toBeNull();
  });

  it('keeps an unfinished upload out of the lesson and out of reach', async () => {
    const { cast, course, lesson } = await setup('text');
    await grantStudent(cast, course.id);
    const started = await cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/attachments`, {
      filename: 'late.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    });
    const { attachmentId } = createAttachmentResponseSchema.parse(started.json());

    const detail = await cast.student.client.get(`/api/v1/courses/${course.id}`);
    expect(detail.json().course.modules[0].lessons[0].attachments).toEqual([]);
    const download = await cast.student.client.get(`/api/v1/attachments/${attachmentId}/download`);
    expect(download.statusCode).toBe(404);
  });

  it('lets only the course manager add and remove attachments', async () => {
    const { cast, lesson } = await setup('text');
    const body = { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 };
    // a published course is visible to everyone, but only its manager may edit it
    expect(
      (await cast.student.client.post(`/api/v1/lessons/${lesson.id}/attachments`, body)).statusCode,
    ).toBe(403);
    expect(
      (await cast.instructorB.client.post(`/api/v1/lessons/${lesson.id}/attachments`, body))
        .statusCode,
    ).toBe(403);
  });

  it('removes an attachment with its file', async () => {
    const { cast, lesson } = await setup('text');
    const { attachmentId } = await sendAttachment(
      cast.instructorA.client,
      lesson.id,
      Buffer.from('hello'),
    );
    const key = lessonFileKeys.attachment(lesson.id, attachmentId);
    expect(await ctx.app.storage.sizeOf(key)).toBe(5);

    const removed = await cast.instructorA.client.delete(
      `/api/v1/lessons/${lesson.id}/attachments/${attachmentId}`,
    );
    expect(removed.statusCode).toBe(200);
    expect(removed.json().course.modules[0].lessons[0].attachments).toEqual([]);
    expect(await ctx.app.storage.sizeOf(key)).toBeNull();
  });

  it('deletes the files of a lesson, and of every lesson of a module, when they are removed', async () => {
    // a draft, so deleting the last lesson is not held back by the publish rules
    const { cast, courseModule, lesson } = await setup('video', 'draft');
    const second = await insertLesson(ctx.app, courseModule.id, 1, { title: 'Two', type: 'text' });
    const first = await sendAttachment(cast.instructorA.client, lesson.id, Buffer.from('one'));
    const other = await sendAttachment(cast.instructorA.client, second.id, Buffer.from('two'));
    await cast.instructorA.client.request('PUT', `/api/v1/lessons/${lesson.id}/captions/en`, {
      body: WEBVTT,
      headers: { 'content-type': 'text/plain' },
    });
    const firstKey = lessonFileKeys.attachment(lesson.id, first.attachmentId);
    const captionKey = lessonFileKeys.caption(lesson.id, 'en');
    const otherKey = lessonFileKeys.attachment(second.id, other.attachmentId);
    expect(await ctx.app.storage.sizeOf(captionKey)).not.toBeNull();

    await cast.instructorA.client.delete(`/api/v1/lessons/${lesson.id}`);
    expect(await ctx.app.storage.sizeOf(firstKey)).toBeNull();
    expect(await ctx.app.storage.sizeOf(captionKey)).toBeNull();
    expect(await ctx.app.storage.sizeOf(otherKey)).toBe(3);

    await cast.instructorA.client.delete(`/api/v1/modules/${courseModule.id}`);
    expect(await ctx.app.storage.sizeOf(otherKey)).toBeNull();
  });

  describe('captions', () => {
    const putCaptions = (
      client: TestClient,
      lessonId: string,
      locale: string,
      text: string | Buffer,
    ) =>
      client.request('PUT', `/api/v1/lessons/${lessonId}/captions/${locale}`, {
        body: text,
        headers: { 'content-type': 'text/plain' },
      });

    it('stores WebVTT as it is and converts SRT, then serves them to a student with a grant', async () => {
      const { cast, course, lesson } = await setup();
      const sent = await putCaptions(cast.instructorA.client, lesson.id, 'en', WEBVTT);
      expect(sent.statusCode).toBe(200);
      await putCaptions(cast.instructorA.client, lesson.id, 'pt-BR', SRT);

      const lessonJson = (await cast.instructorA.client.get(`/api/v1/courses/${course.id}`)).json()
        .course.modules[0].lessons[0];
      expect(lessonJson.captions).toEqual([
        { locale: 'en', url: `/api/v1/lessons/${lesson.id}/captions/en.vtt` },
        { locale: 'pt-BR', url: `/api/v1/lessons/${lesson.id}/captions/pt-BR.vtt` },
      ]);

      const path = `/api/v1/lessons/${lesson.id}/captions/pt-BR.vtt`;
      expect((await cast.student.client.get(path)).statusCode).toBe(403);
      await grantStudent(cast, course.id);
      const served = await cast.student.client.get(path);
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toContain('text/vtt');
      expect(served.body).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n');
      expect(
        (await cast.student.client.get(`/api/v1/lessons/${lesson.id}/captions/fr.vtt`)).statusCode,
      ).toBe(404);
    });

    it('answers 404, not a server error, when the file of a listed caption is gone', async () => {
      const { cast, lesson } = await setup();
      await putCaptions(cast.instructorA.client, lesson.id, 'en', WEBVTT);
      await ctx.app.storage.deleteObject(lessonFileKeys.caption(lesson.id, 'en'));
      const served = await cast.instructorA.client.get(
        `/api/v1/lessons/${lesson.id}/captions/en.vtt`,
      );
      expect(served.statusCode).toBe(404);
    });

    it('replaces the captions of a language and removes them with the file', async () => {
      const { cast, lesson } = await setup();
      const client = cast.instructorA.client;
      await putCaptions(client, lesson.id, 'en', WEBVTT);
      await putCaptions(client, lesson.id, 'en', WEBVTT.replace('Hello', 'Again'));
      const key = lessonFileKeys.caption(lesson.id, 'en');
      expect(await ctx.app.storage.readText(key)).toContain('Again');

      const removed = await client.delete(`/api/v1/lessons/${lesson.id}/captions/en`);
      expect(removed.statusCode).toBe(200);
      expect(removed.json().course.modules[0].lessons[0].captions).toEqual([]);
      expect(await ctx.app.storage.sizeOf(key)).toBeNull();
      expect((await client.delete(`/api/v1/lessons/${lesson.id}/captions/en`)).statusCode).toBe(
        404,
      );
    });

    it('keeps captions uploaded while a lesson update was dropping the old ones', async () => {
      const { cast, lesson } = await setup();
      const client = cast.instructorA.client;
      await putCaptions(client, lesson.id, 'en', WEBVTT);
      const key = lessonFileKeys.caption(lesson.id, 'en');
      const deleteObject = ctx.app.storage.deleteObject.bind(ctx.app.storage);
      let replacement: ReturnType<typeof putCaptions> | undefined;
      const spy = vi.spyOn(ctx.app.storage, 'deleteObject').mockImplementation(async (target) => {
        // new captions arrive right after the update committed, before its cleanup deleted the file
        replacement = putCaptions(client, lesson.id, 'en', WEBVTT.replace('Hello', 'Again'));
        const deadline = Date.now() + 1000;
        while (Date.now() < deadline && !(await ctx.app.storage.readText(key)).includes('Again')) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await deleteObject(target);
      });

      const dropped = await client.patch(`/api/v1/lessons/${lesson.id}`, { captions: [] });
      expect(dropped.statusCode).toBe(200);
      expect((await replacement!).statusCode).toBe(200);
      spy.mockRestore();

      const served = await client.get(`/api/v1/lessons/${lesson.id}/captions/en.vtt`);
      expect(served.statusCode).toBe(200);
      expect(served.body).toContain('Again');
    });

    it('stores captions saved as Latin-1 or UTF-16 with their accents', async () => {
      const { cast, lesson } = await setup();
      const client = cast.instructorA.client;
      const text = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAção e emoção\n';
      const key = (locale: string) => lessonFileKeys.caption(lesson.id, locale);

      expect(
        (await putCaptions(client, lesson.id, 'pt-BR', Buffer.from(text, 'latin1'))).statusCode,
      ).toBe(200);
      expect(await ctx.app.storage.readText(key('pt-BR'))).toBe(text);

      const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
      expect((await putCaptions(client, lesson.id, 'en', utf16)).statusCode).toBe(200);
      expect(await ctx.app.storage.readText(key('en'))).toBe(text);

      const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
      expect((await putCaptions(client, lesson.id, 'en', utf8)).statusCode).toBe(200);
      expect(await ctx.app.storage.readText(key('en'))).toBe(text);
    });

    it('refuses text that is not subtitles and lessons that are not videos', async () => {
      const { cast, courseModule, lesson } = await setup();
      expect(
        (await putCaptions(cast.instructorA.client, lesson.id, 'en', '<html></html>')).statusCode,
      ).toBe(400);
      const textLesson = await insertLesson(ctx.app, courseModule.id, 1, {
        title: 'Reading',
        type: 'text',
      });
      expect(
        (await putCaptions(cast.instructorA.client, textLesson.id, 'en', WEBVTT)).statusCode,
      ).toBe(400);
    });

    it('deletes an uploaded file when a lesson update drops it, and refuses paths to files it does not have', async () => {
      const { cast, lesson } = await setup();
      const client = cast.instructorA.client;
      await putCaptions(client, lesson.id, 'en', WEBVTT);
      const key = lessonFileKeys.caption(lesson.id, 'en');

      const foreign = await client.patch(`/api/v1/lessons/${lesson.id}`, {
        captions: [{ locale: 'fr', url: `/api/v1/lessons/${lesson.id}/captions/fr.vtt` }],
      });
      expect(foreign.statusCode).toBe(400);

      const external = await client.patch(`/api/v1/lessons/${lesson.id}`, {
        captions: [{ locale: 'en', url: 'https://example.com/en.vtt' }],
      });
      expect(external.statusCode).toBe(200);
      expect(await ctx.app.storage.sizeOf(key)).toBeNull();
    });
  });

  it('records no attachment row for a lesson that does not exist', async () => {
    const { cast } = await setup();
    const response = await cast.instructorA.client.post(
      '/api/v1/lessons/00000000-0000-4000-8000-000000000000/attachments',
      { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1 },
    );
    expect(response.statusCode).toBe(404);
    expect(
      await ctx.app.db.select().from(lessonAttachments).where(eq(lessonAttachments.name, 'a.pdf')),
    ).toHaveLength(0);
  });
});
