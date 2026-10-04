import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';

describe('mock course service', () => {
  it('lists every course with the full curriculum', async () => {
    const { services } = createTestServices();
    const courses = await services.courses.list();
    expect(courses).toHaveLength(5);
    expect(courses.every((course) => course.modules.length >= 2)).toBe(true);
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

    const beatriz = await services.courses.list({ instructorId: 'user-beatriz' });
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
        instructorId: 'user-rafael',
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

    it('allows admins and blocks other instructors and students', async () => {
      const id = 'course-javascript';

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
