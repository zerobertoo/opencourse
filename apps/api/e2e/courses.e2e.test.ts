import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { Browser, linkIn, PASSWORD, uniqueEmail, waitForMail } from './support';

/** Registers a student and returns their browser and id. */
async function registerStudent(prefix: string) {
  const browser = new Browser();
  const email = uniqueEmail(prefix);
  const registered = await browser.call('POST', '/auth/register', {
    name: `${prefix} Test`,
    email,
    password: PASSWORD,
  });
  expect(registered.status).toBe(201);
  return { browser, id: registered.body.user.id as string, email };
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

  scenario(
    'lets a student study: complete a lesson, pass the quiz and finish the course',
    async () => {
      const student = await registerStudent('learner');
      await instructor.call('POST', '/grants', { userId: student.id, courseId, expiresAt: null });

      const home = await student.browser.call('GET', '/me/courses');
      const enrolled = home.body.courses.find(
        (item: { course: { id: string } }) => item.course.id === courseId,
      );
      expect(enrolled.progress).toMatchObject({
        completedCount: 0,
        totalCount: 2,
        isComplete: false,
      });
      expect((await student.browser.call('GET', '/me/continue-learning')).body.item).toBeNull();

      // the student sees the lessons; only the instructor knows which option is right
      const lessons = (await student.browser.call('GET', `/courses/${courseId}`)).body.course
        .modules[0].lessons;
      const textLesson = lessons.find((lesson: { type: string }) => lesson.type === 'text');
      const quizLesson = lessons.find((lesson: { type: string }) => lesson.type === 'quiz');
      const answerKey = (
        await instructor.call('GET', `/courses/${courseId}`)
      ).body.course.modules[0].lessons.find((lesson: { type: string }) => lesson.type === 'quiz')
        .quiz.questions[0];
      const right = answerKey.options.find((option: { isCorrect: boolean }) => option.isCorrect);
      const wrong = answerKey.options.find((option: { isCorrect: boolean }) => !option.isCorrect);

      // a quiz lesson cannot be completed by hand
      const manual = await student.browser.call('PUT', `/lessons/${quizLesson.id}/progress`, {
        completed: true,
      });
      expect(manual.status).toBe(400);

      const done = await student.browser.call('PUT', `/lessons/${textLesson.id}/progress`, {
        completed: true,
      });
      expect(done.body.progress.completed).toBe(true);
      const resume = (await student.browser.call('GET', '/me/continue-learning')).body.item;
      expect(resume.lesson.id).toBe(quizLesson.id);
      expect(resume.lesson).not.toHaveProperty('quiz');

      const failed = await student.browser.call('POST', `/quizzes/${quizLesson.id}/attempts`, {
        answers: { [answerKey.id]: wrong.id },
      });
      expect(failed.status).toBe(201);
      expect(failed.body.feedback.passed).toBe(false);
      expect(JSON.stringify(failed.body)).not.toContain(right.id);

      const passed = await student.browser.call('POST', `/quizzes/${quizLesson.id}/attempts`, {
        answers: { [answerKey.id]: right.id },
      });
      expect(passed.body.feedback.passed).toBe(true);
      expect(passed.body.feedback.results[answerKey.id].correctOptionId).toBe(right.id);

      const after = (await student.browser.call('GET', '/me/courses')).body.courses.find(
        (item: { course: { id: string } }) => item.course.id === courseId,
      );
      expect(after.progress).toMatchObject({ completedCount: 2, isComplete: true });
      expect((await student.browser.call('GET', '/me/continue-learning')).body.item).toBeNull();
      expect(
        (await student.browser.call('GET', `/quizzes/${quizLesson.id}/attempts`)).body.attempts,
      ).toHaveLength(2);

      // the instructor sees the student and the completion on the dashboard
      const roster = (await instructor.call('GET', `/courses/${courseId}/students`)).body.students;
      expect(
        roster.find((item: { user: { id: string } }) => item.user.id === student.id),
      ).toMatchObject({ progress: { isComplete: true } });
      const metrics = (await instructor.call('GET', '/studio/metrics')).body;
      expect(
        metrics.courses.find((course: { courseId: string }) => course.courseId === courseId)
          .completedStudents,
      ).toBeGreaterThanOrEqual(1);

      // finishing the course issued the certificate in the background, and the student was told
      let mine: { code: string; holderName: string }[] = [];
      for (let attempt = 0; attempt < 20 && mine.length === 0; attempt += 1) {
        mine = (await student.browser.call('GET', '/me/certificates')).body.certificates;
        if (mine.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(mine).toHaveLength(1);
      expect(mine[0]!.code).toMatch(/^OC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const verified = await new Browser().call('GET', `/certificates/verify/${mine[0]!.code}`);
      expect(verified.status).toBe(200);
      expect(verified.body.holderName).toBe('learner Test');
      expect(JSON.stringify(verified.body)).not.toContain(student.email);
      expect(await waitForMail(student.email)).toContain('/certificates');
    },
  );
});
