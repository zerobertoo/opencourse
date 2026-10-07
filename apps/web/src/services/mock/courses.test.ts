import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';
import { demoId } from '@/services/mock/seed/ids';

describe('mock course service', () => {
  it('lists every course as a summary with curriculum stats and no curriculum', async () => {
    const { services } = createTestServices();
    const courses = await services.courses.list();
    expect(courses).toHaveLength(5);
    expect(courses.every((course) => course.moduleCount >= 2 && course.lessonCount >= 2)).toBe(
      true,
    );
    expect(courses.every((course) => course.durationSeconds > 0)).toBe(true);
    expect(courses.every((course) => !('modules' in course))).toBe(true);
    const detail = await services.courses.getById(courses[0]!.id);
    expect(courses[0]).toMatchObject({
      moduleCount: detail.modules.length,
      lessonCount: detail.modules.flatMap((courseModule) => courseModule.lessons).length,
    });
    expect(courses[0]!.completeLocales).toEqual(expect.any(Array));
  });

  it('reports the signed in user own grant on each listed course', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const courses = await services.courses.list();
    const granted = courses.filter((course) => course.myGrant !== null);
    expect(granted.length).toBeGreaterThan(0);
    for (const course of granted) {
      expect(course.myGrant).toMatchObject({
        userId: demoId('user-lucas'),
        courseId: course.id,
      });
    }
    expect(courses.some((course) => course.myGrant === null)).toBe(true);
  });

  it('reports a past-due grant as expired and ignores revoked ones', async () => {
    const { services } = await createServicesSignedInAs('lucas');
    const [granted, revoked] = (await services.courses.list()).filter((course) => course.myGrant);
    services.mock.store.mutate((db) => {
      for (const grant of db.grants.filter(
        (candidate) => candidate.userId === demoId('user-lucas'),
      )) {
        if (grant.courseId === granted!.id) grant.expiresAt = '2020-01-01T00:00:00.000Z';
        if (grant.courseId === revoked!.id) grant.status = 'revoked';
      }
    });

    const courses = await services.courses.list();
    expect(courses.find((course) => course.id === granted!.id)!.myGrant).toMatchObject({
      status: 'expired',
    });
    expect(courses.find((course) => course.id === revoked!.id)!.myGrant).toBeNull();
  });

  it('limits the managed scope to what the user can edit', async () => {
    const { services } = await createServicesSignedInAs('rafael');
    const own = await services.courses.list({ instructorId: demoId('user-rafael') });
    const managed = await services.courses.list({ scope: 'managed' });
    expect(managed.map((course) => course.id).sort()).toEqual(own.map((c) => c.id).sort());
    expect(managed.length).toBeLessThan((await services.courses.list()).length);

    const { services: admin } = await createServicesSignedInAs('marina');
    expect(await admin.courses.list({ scope: 'managed' })).toHaveLength(5);
  });

  it('filters by status and instructor', async () => {
    const { services } = createTestServices();
    expect(
      (await services.courses.list({ status: 'published' })).map((c) => c.slug).sort(),
    ).toEqual([
      'analise-de-dados-com-sql',
      'design-de-interfaces-na-pratica',
      'fundamentos-de-javascript',
    ]);
    expect(await services.courses.list({ status: 'draft' })).toHaveLength(1);
    expect(await services.courses.list({ status: 'archived' })).toHaveLength(1);

    const beatriz = await services.courses.list({ instructorId: demoId('user-beatriz') });
    expect(beatriz.map((course) => course.slug).sort()).toEqual([
      'design-de-interfaces-na-pratica',
      'fotografia-para-iniciantes',
    ]);
  });

  it('searches titles in any language, ignoring case', async () => {
    const { services } = createTestServices();
    expect((await services.courses.list({ search: 'SQL' })).map((c) => c.slug)).toEqual([
      'analise-de-dados-com-sql',
    ]);
    expect(
      (await services.courses.list({ search: 'interface design' })).map((c) => c.slug),
    ).toEqual(['design-de-interfaces-na-pratica']);
    expect(await services.courses.list({ search: 'inexistente' })).toEqual([]);
  });

  it('finds a course by slug and by id, and fails with not_found otherwise', async () => {
    const { services } = createTestServices();
    const bySlug = await services.courses.getBySlug('fundamentos-de-javascript');
    expect((await services.courses.getById(bySlug.id)).slug).toBe(bySlug.slug);
    await expect(services.courses.getBySlug('nao-existe')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(services.courses.getById('nao-existe')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  describe('create', () => {
    it('creates a draft owned by the signed in instructor with an accent-free unique slug', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const created = await services.courses.create({
        title: 'Introdução à Programação!',
        description: 'Primeiros passos',
        defaultLocale: 'pt-BR',
      });
      expect(created).toMatchObject({
        slug: 'introducao-a-programacao',
        status: 'draft',
        instructorId: demoId('user-rafael'),
        sequentialOrder: false,
        modules: [],
      });
      expect(created.translations).toEqual([
        {
          locale: 'pt-BR',
          title: 'Introdução à Programação!',
          description: 'Primeiros passos',
          learningOutcomes: [],
        },
      ]);

      const duplicate = await services.courses.create({
        title: 'Introdução à Programação',
        defaultLocale: 'pt-BR',
      });
      expect(duplicate.slug).toBe('introducao-a-programacao-2');
    });

    it('requires an instructor or admin and a title', async () => {
      const anonymous = createTestServices().services;
      await expect(
        anonymous.courses.create({ title: 'Curso', defaultLocale: 'pt-BR' }),
      ).rejects.toMatchObject({ code: 'unauthorized' });

      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(
        student.courses.create({ title: 'Curso', defaultLocale: 'pt-BR' }),
      ).rejects.toMatchObject({ code: 'forbidden' });

      const instructor = (await createServicesSignedInAs('rafael')).services;
      await expect(
        instructor.courses.create({ title: '   ', defaultLocale: 'pt-BR' }),
      ).rejects.toMatchObject({ code: 'validation' });
    });
  });

  describe('publishing', () => {
    it('refuses to publish a draft that is not ready and leaves it untouched', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const draft = await services.courses.create({ title: 'Rascunho', defaultLocale: 'pt-BR' });

      await expect(
        services.courses.update(draft.id, { status: 'published' }),
      ).rejects.toMatchObject({
        code: 'validation',
      });
      expect((await services.courses.getById(draft.id)).status).toBe('draft');
    });

    it('publishes once the course has a titled lesson, in the same call that fixes it', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const draft = await services.courses.create({ title: 'Rascunho', defaultLocale: 'pt-BR' });
      const { moduleId } = await services.curriculum.createModule({
        courseId: draft.id,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      await services.curriculum.createLesson({
        moduleId,
        type: 'text',
        title: 'Aula',
        locale: 'pt-BR',
      });

      const published = await services.courses.update(draft.id, { status: 'published' });
      expect(published.status).toBe('published');
    });

    it('does not re-check courses that are already published', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const updated = await services.courses.update(demoId('course-sql'), {
        sequentialOrder: true,
      });
      expect(updated.status).toBe('published');
    });
  });

  describe('update', () => {
    it('lets the owner change status, sequential order and translations by locale', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const before = await services.courses.getBySlug('analise-de-dados-com-sql');

      const updated = await services.courses.update(before.id, {
        status: 'archived',
        sequentialOrder: true,
        translations: [
          {
            locale: 'en',
            title: 'Intro to Data Analysis with SQL',
            description: 'Query data',
            learningOutcomes: [],
          },
        ],
      });
      expect(updated).toMatchObject({ status: 'archived', sequentialOrder: true });
      expect(updated.translations.map((t) => t.locale).sort()).toEqual(['en', 'pt-BR']);
      expect(updated.translations.find((t) => t.locale === 'pt-BR')?.title).toBe(
        before.translations[0]?.title,
      );

      const replaced = await services.courses.update(before.id, {
        translations: [
          { locale: 'en', title: 'Revised title', description: '', learningOutcomes: [] },
        ],
      });
      expect(replaced.translations).toHaveLength(2);
      expect(replaced.translations.find((t) => t.locale === 'en')?.title).toBe('Revised title');
    });

    it('stores the certificate template, trimming its text', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const updated = await services.courses.update(demoId('course-sql'), {
        certificateTemplate: {
          enabled: false,
          signatoryName: '  Rafael T.  ',
          signatoryRole: ' Instrutor ',
          message: ' Parabéns! ',
        },
      });
      expect(updated.certificateTemplate).toEqual({
        enabled: false,
        signatoryName: 'Rafael T.',
        signatoryRole: 'Instrutor',
        message: 'Parabéns!',
      });
    });

    it('allows admins and blocks other instructors and students', async () => {
      const id = demoId('course-javascript');

      const admin = (await createServicesSignedInAs('marina')).services;
      await expect(admin.courses.update(id, { status: 'draft' })).resolves.toMatchObject({
        status: 'draft',
      });

      const otherInstructor = (await createServicesSignedInAs('beatriz')).services;
      await expect(otherInstructor.courses.update(id, { status: 'draft' })).rejects.toMatchObject({
        code: 'forbidden',
      });

      const student = (await createServicesSignedInAs('lucas')).services;
      await expect(student.courses.update(id, { status: 'draft' })).rejects.toMatchObject({
        code: 'forbidden',
      });
    });
  });
});

describe('student visibility of unpublished courses', () => {
  it('keeps an archived course readable to students with a grant', async () => {
    const { services } = createTestServices();
    await services.auth.signIn('lucas@opencourse.example', 'x');
    expect(await services.enrollments.canAccess(demoId('course-sql'))).toBe(true);
    expect((await services.enrollments.listMyCourses()).map((e) => e.course.id)).toContain(
      demoId('course-sql'),
    );

    await services.auth.signIn('rafael@opencourse.example', 'x');
    await services.courses.update(demoId('course-sql'), { status: 'archived' });

    await services.auth.signIn('lucas@opencourse.example', 'x');
    expect(await services.enrollments.canAccess(demoId('course-sql'))).toBe(true);
    expect((await services.enrollments.listMyCourses()).map((e) => e.course.id)).toContain(
      demoId('course-sql'),
    );

    await services.auth.signIn('rafael@opencourse.example', 'x');
    await services.courses.update(demoId('course-sql'), { status: 'draft' });

    await services.auth.signIn('lucas@opencourse.example', 'x');
    expect(await services.enrollments.canAccess(demoId('course-sql'))).toBe(false);
  });
});
