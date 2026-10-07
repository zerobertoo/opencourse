import { inject, it, expect } from 'vitest';
import { Browser, compose, PASSWORD, uniqueEmail, waitFor, waitForMail } from './support';

// stops and starts the worker service, so it needs the Compose stack and runs alone (see the config)
it('issues the certificate and mails it after the worker was down when the course was completed', async (context) => {
  const provided = inject('e2eAdmin');
  // only the first account of an instance is admin, and building a course needs one
  if (provided.role !== 'admin') return context.skip();

  const admin = new Browser();
  await admin.call('POST', '/auth/login', { email: provided.email, password: PASSWORD });
  const instructor = new Browser();
  const registered = await instructor.call('POST', '/auth/register', {
    name: 'Worker Instructor',
    email: uniqueEmail('worker-instructor'),
    password: PASSWORD,
  });
  await admin.call('PATCH', `/admin/users/${registered.body.user.id}/role`, { role: 'instructor' });

  const created = await instructor.call('POST', '/courses', {
    title: 'Worker resilience',
    defaultLocale: 'en',
  });
  const courseId = created.body.course.id as string;
  const { moduleId } = (
    await instructor.call('POST', `/courses/${courseId}/modules`, { title: 'Module', locale: 'en' })
  ).body;
  const { lessonId } = (
    await instructor.call('POST', `/modules/${moduleId}/lessons`, {
      type: 'text',
      title: 'Only lesson',
      locale: 'en',
    })
  ).body;
  await instructor.call('PATCH', `/lessons/${lessonId}`, {
    translations: [{ locale: 'en', title: 'Only lesson', content: 'Text' }],
    durationSeconds: 60,
  });
  expect(
    (await instructor.call('PATCH', `/courses/${courseId}`, { status: 'published' })).status,
  ).toBe(200);

  const student = new Browser();
  const studentEmail = uniqueEmail('worker-student');
  const signedUp = await student.call('POST', '/auth/register', {
    name: 'Worker Student',
    email: studentEmail,
    password: PASSWORD,
  });
  await instructor.call('POST', '/grants', {
    userId: signedUp.body.user.id,
    courseId,
    expiresAt: null,
  });

  const certificates = async () =>
    (await student.call('GET', '/me/certificates')).body.certificates as unknown[];

  try {
    compose('stop', 'worker');
    const completed = await student.call('PUT', `/lessons/${lessonId}/progress`, {
      completed: true,
    });
    expect(completed.status).toBe(200);

    // the worker is down: the completion is safe in the outbox, nothing is issued yet
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await certificates()).toHaveLength(0);
  } finally {
    compose('start', 'worker');
  }

  await waitFor(
    'the certificate to be issued',
    async () => (await certificates()).length === 1,
    30_000,
  );
  expect(await waitForMail(studentEmail, 30_000)).toContain('/certificates');
}, 90_000);
