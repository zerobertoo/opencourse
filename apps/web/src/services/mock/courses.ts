import { getPublishIssues, type CourseDetail } from '@opencourse/shared';
import type { CourseService } from '../courses';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import { canManageCourse, findCourseById } from './helpers';
import { clone } from './store';

/** "Introdução a SQL!" becomes "introducao-a-sql". */
function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createMockCourseService(context: MockContext): CourseService {
  const { store } = context;

  return {
    list: (filters = {}) =>
      context.run('courses.list', () => {
        const search = filters.search?.trim().toLowerCase();
        const courses = store.db.courses.filter((course) => {
          if (filters.status && course.status !== filters.status) return false;
          if (filters.instructorId && course.instructorId !== filters.instructorId) return false;
          if (search) {
            return course.translations.some((translation) =>
              translation.title.toLowerCase().includes(search),
            );
          }
          return true;
        });
        return clone(courses);
      }),

    getBySlug: (slug) =>
      context.run('courses.getBySlug', () => {
        const course = store.db.courses.find((candidate) => candidate.slug === slug);
        if (!course) throw new ServiceError('not_found', `Course not found: ${slug}`);
        return clone(course);
      }),

    getById: (id) => context.run('courses.getById', () => clone(findCourseById(store.db, id))),

    create: (input) =>
      context.run('courses.create', () => {
        const user = context.requireRole('instructor', 'admin');
        const title = input.title.trim();
        if (title === '') throw new ServiceError('validation', 'Title is required');

        const baseSlug = slugify(title) || 'curso';
        let slug = baseSlug;
        for (let suffix = 2; store.db.courses.some((course) => course.slug === slug); suffix++) {
          slug = `${baseSlug}-${suffix}`;
        }

        const timestamp = context.now().toISOString();
        const course: CourseDetail = {
          id: store.nextId('course'),
          slug,
          status: 'draft',
          coverImageUrl: null,
          instructorId: user.id,
          defaultLocale: input.defaultLocale,
          sequentialOrder: false,
          certificateTemplate: {
            enabled: true,
            signatoryName: user.name,
            signatoryRole: '',
            message: '',
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          translations: [
            {
              locale: input.defaultLocale,
              title,
              description: input.description?.trim() ?? '',
              learningOutcomes: [],
            },
          ],
          modules: [],
        };
        store.mutate((db) => db.courses.push(course));
        return clone(course);
      }),

    update: (id, input) =>
      context.run('courses.update', () => {
        const user = context.requireRole('instructor', 'admin');
        const course = findCourseById(store.db, id);
        if (!canManageCourse(user, course)) {
          throw new ServiceError('forbidden', 'Only the course instructor or an admin can edit it');
        }

        // validate the resulting course before touching the stored one
        const next = clone(course);
        if (input.status !== undefined) next.status = input.status;
        if (input.sequentialOrder !== undefined) next.sequentialOrder = input.sequentialOrder;
        if (input.defaultLocale !== undefined) next.defaultLocale = input.defaultLocale;
        if (input.certificateTemplate !== undefined) {
          next.certificateTemplate = {
            ...input.certificateTemplate,
            signatoryName: input.certificateTemplate.signatoryName.trim(),
            signatoryRole: input.certificateTemplate.signatoryRole.trim(),
            message: input.certificateTemplate.message.trim(),
          };
        }
        for (const translation of input.translations ?? []) {
          const index = next.translations.findIndex((item) => item.locale === translation.locale);
          if (index >= 0) next.translations[index] = clone(translation);
          else next.translations.push(clone(translation));
        }
        if (
          next.status === 'published' &&
          course.status !== 'published' &&
          getPublishIssues(next).length > 0
        ) {
          throw new ServiceError('validation', 'The course is not ready to be published');
        }

        store.mutate(() => {
          Object.assign(course, next, { updatedAt: context.now().toISOString() });
        });
        return clone(course);
      }),
  };
}
