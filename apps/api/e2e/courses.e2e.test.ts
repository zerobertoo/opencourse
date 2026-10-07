import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { Browser, linkIn, PASSWORD, uniqueEmail, waitForMail } from './support';

/** Registers a student and returns their browser and id. */
async function registerStudent(prefix: string) {
  const browser = new Browser();
  const registered = await browser.call('POST', '/auth/register', {
    name: `${prefix} Test`,
    email: uniqueEmail(prefix),
    password: PASSWORD,
  });
  expect(registered.status).toBe(201);
  return { browser, id: registered.body.user.id as string };
}

describe('stack: courses and grants', () => {
  const provided = inject('e2eAdmin');
  const admin = new Browser();
  const instructor = new Browser();
  let courseId = '';

  // only the very first account of an instance becomes admin: on a used database nothing here can run
  const scenario = (name: string, run: () => Promise<void>) =>
    it(name, async (context) => {
      if (provided.role !== 'admin') return context.skip();
      await run();
    });

  beforeAll(async () => {
    if (provided.role !== 'admin') return;
    expect(
      (await admin.call('POST', '/auth/login', { email: provided.email, password: PASSWORD }))
        .status,
    ).toBe(200);

    const registered = await instructor.call('POST', '/auth/register', {
      name: 'Instructor Test',
      email: uniqueEmail('instructor'),
      password: PASSWORD,
    });
    const promoted = await admin.call('PATCH', `/admin/users/${registered.body.user.id}/role`, {
      role: 'instructor',
    });
    expect(promoted.status).toBe(200);
  });

  scenario('lets an instructor build a course and publish it only when it is ready', async () => {
    const created = await instructor.call('POST', '/courses', {
      title: 'Introdução à Lógica',
      description: 'Primeiros passos',
      defaultLocale: 'pt-BR',
    });
    expect(created.status).toBe(201);
    courseId = created.body.course.id;
    expect(created.body.course.slug).toBe('introducao-a-logica');

    // an empty course cannot go live
    const early = await instructor.call('PATCH', `/courses/${courseId}`, { status: 'published' });
    expect(early.status).toBe(400);
    expect(early.body.error.details.issues).toContain('noLessons');

    const withModule = await instructor.call('POST', `/courses/${courseId}/modules`, {
      title: 'Módulo 1',
      locale: 'pt-BR',
    });
    const moduleId = withModule.body.moduleId;
    const withLesson = await instructor.call('POST', `/modules/${moduleId}/lessons`, {
      type: 'text',
      title: 'Aula 1',
      locale: 'pt-BR',
    });
    await instructor.call('PATCH', `/lessons/${withLesson.body.lessonId}`, {
      translations: [{ locale: 'pt-BR', title: 'Aula 1', content: 'Conteúdo secreto' }],
      durationSeconds: 120,
    });

    const quiz = await instructor.call('POST', `/modules/${moduleId}/lessons`, {
      type: 'quiz',
      title: 'Quiz',
      locale: 'pt-BR',
    });
    const [rightId, wrongId, questionId] = [randomUUID(), randomUUID(), randomUUID()];
    const savedQuiz = await instructor.call('PATCH', `/lessons/${quiz.body.lessonId}`, {
      quiz: {
        passingScore: 70,
        questions: [
          {
            id: questionId,
            translations: [{ locale: 'pt-BR', prompt: 'Verdadeiro?', explanation: 'Porque sim' }],
            options: [
              { id: rightId, isCorrect: true, translations: [{ locale: 'pt-BR', text: 'Sim' }] },
              { id: wrongId, isCorrect: false, translations: [{ locale: 'pt-BR', text: 'Não' }] },
            ],
          },
        ],
      },
    });
    expect(savedQuiz.status).toBe(200);

    const published = await instructor.call('PATCH', `/courses/${courseId}`, {
      status: 'published',
    });
    expect(published.status).toBe(200);
    expect(published.body.course.status).toBe('published');
  });

  scenario(
    'shows a student the course but keeps its content closed until access is granted',
    async () => {
      const student = await registerStudent('student');
      const catalog = await student.browser.call('GET', '/courses');
      const listed = catalog.body.courses.find((course: { id: string }) => course.id === courseId);
      expect(listed).toMatchObject({ lessonCount: 2, moduleCount: 1, myGrant: null });
      expect(listed.modules).toBeUndefined();

      // the summary is public to signed-in users, the content is not
      expect((await student.browser.call('GET', `/courses/${courseId}`)).status).toBe(403);
      expect(
        (await student.browser.call('GET', '/courses/by-slug/introducao-a-logica')).status,
      ).toBe(403);

      const granted = await instructor.call('POST', '/grants', {
        userId: student.id,
        courseId,
        expiresAt: null,
      });
      expect(granted.status).toBe(201);
      expect(granted.body.grant).toMatchObject({ source: 'manual', status: 'active' });

      const opened = await student.browser.call('GET', `/courses/${courseId}`);
      expect(opened.status).toBe(200);
      expect(JSON.stringify(opened.body)).toContain('Conteúdo secreto');
      // the answers never reach a student
      expect(JSON.stringify(opened.body)).not.toContain('isCorrect');
      const mine = (await student.browser.call('GET', '/courses')).body.courses.find(
        (course: { id: string }) => course.id === courseId,
      );
      expect(mine.myGrant.status).toBe('active');

      // another student, and the other instructor's reach, stay closed
      const stranger = await registerStudent('stranger');
      expect((await stranger.browser.call('GET', `/courses/${courseId}`)).status).toBe(403);
      expect(
        (
          await stranger.browser.call('POST', '/grants', {
            userId: stranger.id,
            courseId,
            expiresAt: null,
          })
        ).status,
      ).toBe(403);

      // granting again extends instead of stacking
      const again = await instructor.call('POST', '/grants', {
        userId: student.id,
        courseId,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(again.status).toBe(200);
      expect(again.body.grant.id).toBe(granted.body.grant.id);

      // revoking closes the content again
      const revoked = await instructor.call('POST', `/grants/${granted.body.grant.id}/revoke`);
      expect(revoked.body.grant.status).toBe('revoked');
      expect((await student.browser.call('GET', `/courses/${courseId}`)).status).toBe(403);
      expect(
        (await instructor.call('GET', `/grants?courseId=${courseId}`)).body.grants,
      ).toHaveLength(1);
    },
  );

  scenario('hides a draft from students and lets only its owner or an admin edit it', async () => {
    const draft = await instructor.call('POST', '/courses', {
      title: 'Rascunho',
      defaultLocale: 'pt-BR',
    });
    const draftId = draft.body.course.id;
    const student = await registerStudent('draftwatcher');
    expect((await student.browser.call('GET', `/courses/${draftId}`)).status).toBe(404);
    expect(
      (await student.browser.call('PATCH', `/courses/${draftId}`, { sequentialOrder: true }))
        .status,
    ).toBe(404);
    expect((await admin.call('GET', `/courses/${draftId}`)).status).toBe(200);
    expect((await admin.call('GET', '/courses?scope=managed')).body.courses.length).toBeGreaterThan(
      1,
    );
  });

  scenario('gives an invitee the course access when they accept an invite for it', async () => {
    const inviteeEmail = uniqueEmail('invitee');
    const invited = await instructor.call('POST', '/invites', { email: inviteeEmail, courseId });
    expect(invited.status).toBe(201);
    const token = linkIn(await waitForMail(inviteeEmail)).split('/invite/')[1]!;

    const guest = new Browser();
    const accepted = await guest.call('POST', `/invites/${token}/accept`, {
      name: 'Invited Student',
      password: PASSWORD,
    });
    expect(accepted.status).toBe(201);

    // straight in, with no separate grant step
    const opened = await guest.call('GET', `/courses/${courseId}`);
    expect(opened.status).toBe(200);
    expect(opened.body.course.modules[0].lessons).toHaveLength(2);
    const mine = (await guest.call('GET', '/courses')).body.courses.find(
      (course: { id: string }) => course.id === courseId,
    );
    expect(mine.myGrant).toMatchObject({ source: 'invite', status: 'active' });
  });
});
