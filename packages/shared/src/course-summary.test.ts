import { describe, expect, it } from 'vitest';
import { getCourseSummaryStats, listedCourseSchema, type CourseDetail } from './index';

const ID = (n: number) => `7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e${String(n).padStart(2, '0')}`;

function lesson(n: number, order: number, seconds: number, locales: Array<'pt-BR' | 'en'>) {
  return {
    id: ID(n),
    moduleId: ID(2),
    order,
    type: 'text' as const,
    durationSeconds: seconds,
    attachments: [],
    translations: locales.map((locale) => ({ locale, title: `Lesson ${n}`, content: '' })),
  };
}

function course(lessonLocales: Array<'pt-BR' | 'en'>): CourseDetail {
  return {
    id: ID(1),
    slug: 'course',
    status: 'published',
    coverImageUrl: null,
    instructorId: ID(3),
    defaultLocale: 'en',
    sequentialOrder: false,
    certificateTemplate: { enabled: true, signatoryName: '', signatoryRole: '', message: '' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    translations: [
      { locale: 'en', title: 'Course', description: '', learningOutcomes: [] },
      { locale: 'pt-BR', title: 'Curso', description: '', learningOutcomes: [] },
    ],
    modules: [
      {
        id: ID(2),
        courseId: ID(1),
        order: 0,
        translations: [
          { locale: 'en', title: 'Module' },
          { locale: 'pt-BR', title: 'Módulo' },
        ],
        lessons: [lesson(4, 0, 90, lessonLocales), lesson(5, 1, 30, ['en', 'pt-BR'])],
      },
    ],
  };
}

describe('getCourseSummaryStats', () => {
  it('counts modules, lessons and duration', () => {
    expect(getCourseSummaryStats(course(['en', 'pt-BR']))).toMatchObject({
      moduleCount: 1,
      lessonCount: 2,
      durationSeconds: 120,
    });
  });

  it('lists only the supported locales whose whole course is translated', () => {
    expect(getCourseSummaryStats(course(['en', 'pt-BR'])).completeLocales).toEqual(['pt-BR', 'en']);
    expect(getCourseSummaryStats(course(['en'])).completeLocales).toEqual(['en']);
  });

  it('counts an empty course as complete in every language', () => {
    const empty = { ...course(['en']), modules: [] };
    expect(getCourseSummaryStats(empty)).toMatchObject({
      moduleCount: 0,
      lessonCount: 0,
      durationSeconds: 0,
    });
  });
});

describe('listedCourseSchema', () => {
  it('requires the stats and a nullable grant of the caller', () => {
    const { modules, ...summary } = course(['en']);
    void modules;
    const listed = { ...summary, ...getCourseSummaryStats(course(['en'])), myGrant: null };
    expect(listedCourseSchema.safeParse(listed).success).toBe(true);
    const { myGrant, ...withoutGrant } = listed;
    void myGrant;
    expect(listedCourseSchema.safeParse(withoutGrant).success).toBe(false);
    const { moduleCount, ...withoutStats } = listed;
    void moduleCount;
    expect(listedCourseSchema.safeParse(withoutStats).success).toBe(false);
  });
});
