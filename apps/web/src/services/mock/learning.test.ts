import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';
import { demoId } from '@/services/mock/seed/ids';

describe('mock enrollment service', () => {
  it('requires authentication', async () => {
    const { services } = createTestServices();
    await expect(services.enrollments.listMyCourses()).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('lists only courses with an active grant, most recent activity first, with progress', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const courses = await services.enrollments.listMyCourses();

    expect(courses.map((entry) => entry.course.id)).toEqual([
      demoId('course-javascript'),
      demoId('course-design'),
      demoId('course-sql'),
    ]);
    const [javascript, design, sql] = courses;
    expect(javascript?.progress).toMatchObject({
      completedCount: 4,
      totalCount: 10,
      isComplete: false,
    });
    expect(javascript?.progress.percent).toBeCloseTo(0.4);
    expect(design?.progress).toMatchObject({ completedCount: 2, totalCount: 10 });
    expect(sql?.progress).toMatchObject({ percent: 1, isComplete: true, nextLessonId: null });
  });

  it('hides courses whose grant expired or was revoked', async () => {
    const { services } = await createServicesSignedInAs('juliana');
    expect(await services.enrollments.listMyCourses()).toEqual([]);
    expect(await services.enrollments.canAccess(demoId('course-javascript'))).toBe(false);
    expect(await services.enrollments.canAccess(demoId('course-sql'))).toBe(false);
  });

  it('checks access by grant, and always allows the course instructor and admins', async () => {
    const student = (await createServicesSignedInAs('gustavo')).services;
    expect(await student.enrollments.canAccess(demoId('course-sql'))).toBe(true);
    expect(await student.enrollments.canAccess(demoId('course-javascript'))).toBe(false);

    const instructor = (await createServicesSignedInAs('rafael')).services;
    expect(await instructor.enrollments.canAccess(demoId('course-javascript'))).toBe(true);
    expect(await instructor.enrollments.canAccess(demoId('course-design'))).toBe(false);

    const admin = (await createServicesSignedInAs('marina')).services;
    expect(await admin.enrollments.canAccess(demoId('course-design'))).toBe(true);
  });

  it('continues where the student stopped, including the saved video position', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const item = await services.enrollments.getContinueLearning();
    expect(item?.course.id).toBe(demoId('course-javascript'));
    expect(item?.lesson.id).toBe(demoId('les-js-2-1'));
    expect(item?.videoPositionSeconds).toBe(312);
  });

  it('has nothing to continue for a student who has not started anything', async () => {
    const { services } = await createServicesSignedInAs('gustavo');
    expect(await services.enrollments.getContinueLearning()).toBeNull();
  });

  describe('listCourseStudents', () => {
    it('lists the students of the course with progress and effective grant status', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const students = await services.enrollments.listCourseStudents(demoId('course-javascript'));

      const byName = Object.fromEntries(students.map((entry) => [entry.user.name, entry]));
      expect(Object.keys(byName)).toEqual(
        expect.arrayContaining(['Lucas Ferreira', 'Thiago Moreira', 'Juliana Prado']),
      );
      expect(byName['Thiago Moreira']?.progress.completedCount).toBe(9);
      expect(byName['Juliana Prado']?.grant.status).toBe('expired');
      expect(byName['Lucas Ferreira']?.grant.status).toBe('active');
      expect(new Set(students.map((entry) => entry.user.id)).size).toBe(students.length);
    });

    it('is restricted to the course instructor and admins', async () => {
      const other = (await createServicesSignedInAs('beatriz')).services;
      await expect(other.enrollments.listCourseStudents(demoId('course-javascript'))).rejects.toMatchObject(
        {
          code: 'forbidden',
        },
      );
      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(
        student.enrollments.listCourseStudents(demoId('course-javascript')),
      ).rejects.toMatchObject({
        code: 'forbidden',
      });
      const admin = (await createServicesSignedInAs('marina')).services;
      await expect(
        admin.enrollments.listCourseStudents(demoId('course-javascript')),
      ).resolves.not.toHaveLength(0);
    });
  });
});

describe('mock progress service', () => {
  it('returns only the progress of the current user in the course', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const progress = await services.progress.getCourseProgress(demoId('course-javascript'));
    expect(progress.every((entry) => entry.userId === demoId('user-lucas'))).toBe(true);
    expect(progress.filter((entry) => entry.completed)).toHaveLength(4);
    expect(progress.find((entry) => entry.lessonId === demoId('les-js-2-1'))?.videoPositionSeconds).toBe(
      312,
    );
  });

  it('marks a lesson as completed and updates the course summary', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const entry = await services.progress.setLessonCompleted(demoId('les-js-2-1'), true);
    expect(entry).toMatchObject({ lessonId: demoId('les-js-2-1'), completed: true });

    const js = (await services.enrollments.listMyCourses()).find(
      (c) => c.course.id === demoId('course-javascript'),
    );
    expect(js?.progress.completedCount).toBe(5);
    expect(js?.progress.nextLessonId).toBe(demoId('les-js-2-2'));
  });

  it('can undo a completion', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    await services.progress.setLessonCompleted(demoId('les-js-1-1'), false);
    const js = (await services.enrollments.listMyCourses()).find(
      (c) => c.course.id === demoId('course-javascript'),
    );
    expect(js?.progress.completedCount).toBe(3);
    expect(js?.progress.nextLessonId).toBe(demoId('les-js-1-1'));
  });

  it('allows any lesson when the course is not sequential', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    await expect(services.progress.setLessonCompleted(demoId('les-js-3-1'), true)).resolves.toMatchObject({
      completed: true,
    });
  });

  it('blocks locked lessons in a sequential course until the previous ones are done', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    // Lucas completed the first 2 of the design course; the 3rd is unlocked, the 7th is not
    await expect(
      services.progress.setLessonCompleted(demoId('les-design-2-1'), true),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      services.progress.setLessonCompleted(demoId('les-design-1-3'), true),
    ).resolves.toMatchObject({
      completed: true,
    });
    await expect(
      services.progress.setLessonCompleted(demoId('les-design-2-1'), true),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('requires an active grant', async () => {
    const { services } = await createServicesSignedInAs('gustavo');
    await expect(services.progress.setLessonCompleted(demoId('les-js-1-1'), true)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('fails with not_found for an unknown lesson', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    await expect(
      services.progress.setLessonCompleted(demoId('les-inexistente'), true),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  describe('video position', () => {
    it('saves the position and clamps it to the lesson duration', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      expect(
        (await services.progress.saveVideoPosition(demoId('les-js-2-1'), 120)).videoPositionSeconds,
      ).toBe(120);
      expect(
        (await services.progress.saveVideoPosition(demoId('les-js-2-1'), 99999)).videoPositionSeconds,
      ).toBe(870);
      expect(
        (await services.progress.saveVideoPosition(demoId('les-js-2-1'), -5)).videoPositionSeconds,
      ).toBe(0);
    });

    it('only applies to video lessons', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      await expect(services.progress.saveVideoPosition(demoId('les-js-2-2'), 10)).rejects.toMatchObject({
        code: 'validation',
      });
    });

    it('does not complete the lesson', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      const entry = await services.progress.saveVideoPosition(demoId('les-js-2-3'), 200);
      expect(entry.completed).toBe(false);
    });
  });

  describe('quizzes', () => {
    it('fails below the minimum score, keeps the lesson incomplete and returns per question feedback', async () => {
      const { services } = await createServicesSignedInAs('camila');
      const { attempt, score } = await services.progress.submitQuizAttempt(demoId('les-js-1-4'), {
        [demoId('q-js-1')]: demoId('q-js-1-b'),
        [demoId('q-js-2')]: demoId('q-js-2-b'),
      });
      expect(attempt).toMatchObject({ score: 33, passed: false, userId: demoId('user-camila') });
      expect(score.results[demoId('q-js-1')]).toMatchObject({
        isCorrect: false,
        correctOptionId: demoId('q-js-1-a'),
      });
      expect(score.results[demoId('q-js-3')]?.selectedOptionId).toBeNull();

      const progress = await services.progress.getCourseProgress(demoId('course-javascript'));
      expect(progress.some((entry) => entry.lessonId === demoId('les-js-1-4') && entry.completed)).toBe(
        false,
      );
    });

    it('passes, completes the lesson and records every attempt in order', async () => {
      const { services } = await createServicesSignedInAs('camila');
      await services.progress.submitQuizAttempt(demoId('les-js-1-4'), {});
      const { attempt } = await services.progress.submitQuizAttempt(demoId('les-js-1-4'), {
        [demoId('q-js-1')]: demoId('q-js-1-a'),
        [demoId('q-js-2')]: demoId('q-js-2-b'),
        [demoId('q-js-3')]: demoId('q-js-3-b'),
      });
      expect(attempt).toMatchObject({ score: 100, passed: true });

      const progress = await services.progress.getCourseProgress(demoId('course-javascript'));
      expect(progress.find((entry) => entry.lessonId === demoId('les-js-1-4'))?.completed).toBe(true);

      const attempts = await services.progress.listQuizAttempts(demoId('les-js-1-4'));
      expect(attempts.map((item) => item.score)).toEqual([0, 100]);
    });

    it('lists the seeded attempts of the demo student', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      const attempts = await services.progress.listQuizAttempts(demoId('les-js-1-4'));
      expect(attempts.map((item) => [item.score, item.passed])).toEqual([
        [33, false],
        [100, true],
      ]);
    });

    it('rejects attempts on lessons that are not quizzes', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      await expect(services.progress.submitQuizAttempt(demoId('les-js-2-1'), {})).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });
});

describe('mock certificate service', () => {
  it('lists the certificates of the signed in student', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const certificates = await services.certificates.listMine();
    expect(certificates).toHaveLength(1);
    expect(certificates[0]).toMatchObject({
      code: 'OC-7K2M-9QXA',
      holderName: 'Lucas Ferreira',
      course: { slug: 'analise-de-dados-com-sql' },
    });
  });

  it('verifies a certificate publicly, ignoring case and spaces, and returns null for unknown codes', async () => {
    const { services } = createTestServices();
    expect((await services.certificates.verify(' oc-7k2m-9qxa '))?.holderName).toBe(
      'Lucas Ferreira',
    );
    expect(await services.certificates.verify('OC-0000-0000')).toBeNull();
  });

  it('issues a certificate once, when the last lesson of the course is completed', async () => {
    const { services } = await createServicesSignedInAs('thiago');
    expect(await services.certificates.listMine()).toHaveLength(0);

    // only the final quiz of the JavaScript course is missing
    await services.progress.submitQuizAttempt(demoId('les-js-3-3'), {
      [demoId('q-js-4')]: demoId('q-js-4-b'),
      [demoId('q-js-5')]: demoId('q-js-5-b'),
    });
    const [certificate] = await services.certificates.listMine();
    expect(certificate).toMatchObject({
      courseId: demoId('course-javascript'),
      holderName: 'Thiago Moreira',
    });
    expect(certificate?.code).toMatch(/^OC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await services.certificates.verify(certificate!.code))?.id).toBe(certificate?.id);

    // redoing the completion does not issue another one
    await services.progress.setLessonCompleted(demoId('les-js-3-3'), false);
    await services.progress.setLessonCompleted(demoId('les-js-3-3'), true);
    expect(await services.certificates.listMine()).toHaveLength(1);
  });

  it('does not issue a certificate before the course is complete', async () => {
    const { services } = await createServicesSignedInAs('camila');
    await services.progress.setLessonCompleted(demoId('les-js-3-1'), true);
    expect(await services.certificates.listMine()).toHaveLength(0);
  });
});

describe('notes and password', () => {
  it('saves, updates and removes a personal note per lesson', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    expect(await services.notes.getLessonNote(demoId('les-js-2-1'))).toBeNull();

    await services.notes.saveLessonNote(demoId('les-js-2-1'), 'Closures guardam o escopo');
    expect((await services.notes.getLessonNote(demoId('les-js-2-1')))?.content).toBe(
      'Closures guardam o escopo',
    );

    await services.notes.saveLessonNote(demoId('les-js-2-1'), 'Texto novo');
    expect((await services.notes.getLessonNote(demoId('les-js-2-1')))?.content).toBe('Texto novo');

    expect(await services.notes.saveLessonNote(demoId('les-js-2-1'), '   ')).toBeNull();
    expect(await services.notes.getLessonNote(demoId('les-js-2-1'))).toBeNull();
  });

  it('keeps notes private to the author and blocks lessons without access', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    await services.notes.saveLessonNote(demoId('les-js-2-1'), 'Só minha');
    await services.auth.signIn('camila@opencourse.example', 'qualquer-senha');
    expect(await services.notes.getLessonNote(demoId('les-js-2-1'))).toBeNull();

    // Camila has no active grant for the design course
    await expect(services.notes.getLessonNote(demoId('les-design-1-1'))).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('validates the password change', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    await expect(services.auth.changePassword('', 'novasenha123')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(services.auth.changePassword('atual', 'curta')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(services.auth.changePassword('atual', 'novasenha123')).resolves.toBeUndefined();
  });
});
