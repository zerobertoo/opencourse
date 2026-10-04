import {
  fileAttachmentSchema,
  quizSchema,
  type CourseDetail,
  type CourseModuleWithLessons,
  type Lesson,
} from '@opencourse/shared';
import { z } from 'zod';
import type { CurriculumLayoutItem, CurriculumService, UpdateLessonInput } from '../curriculum';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import { canManageCourse, findCourseById, findLesson, findModule } from './helpers';
import { clone } from './store';

const SAMPLE_VIDEO_URL = '/media/sample-lesson.mp4';
const VIDEO_FILE_PATTERN = /\.(mp4|mov|webm|mkv|m4v)$/i;
const DEFAULT_PASSING_SCORE = 70;

const durationSchema = z.number().int().nonnegative();

/** Keeps `order` and `moduleId` consistent with the position in the arrays. */
function renumber(course: CourseDetail): void {
  course.modules.forEach((courseModule, moduleIndex) => {
    courseModule.order = moduleIndex;
    courseModule.lessons.forEach((lesson, lessonIndex) => {
      lesson.order = lessonIndex;
      lesson.moduleId = courseModule.id;
    });
  });
}

/** Replaces the entries whose locale is in `incoming`, appends the new ones. */
function mergeByLocale<T extends { locale: string }>(current: T[], incoming: T[]): void {
  for (const item of incoming) {
    const index = current.findIndex((existing) => existing.locale === item.locale);
    if (index >= 0) current[index] = clone(item);
    else current.push(clone(item));
  }
}

export function createMockCurriculumService(context: MockContext): CurriculumService {
  const { store } = context;
  /** Latest upload started for each lesson, so an outdated timer never overrides a newer video. */
  const uploadTokens = new Map<string, number>();
  let uploadCounter = 0;

  function requireManager(course: CourseDetail): void {
    const user = context.requireRole('instructor', 'admin');
    if (!canManageCourse(user, course)) {
      throw new ServiceError('forbidden', 'Only the course instructor or an admin can edit it');
    }
  }

  /** Applies a change to a course the user manages, then returns a copy of the result. */
  function changeCourse(
    course: CourseDetail,
    change: (course: CourseDetail) => void,
  ): CourseDetail {
    requireManager(course);
    store.mutate(() => {
      change(course);
      renumber(course);
      course.updatedAt = context.now().toISOString();
    });
    return clone(course);
  }

  function removeLessonData(lessonIds: string[]): void {
    const ids = new Set(lessonIds);
    store.mutate((db) => {
      db.progress = db.progress.filter((entry) => !ids.has(entry.lessonId));
      db.notes = db.notes.filter((note) => !ids.has(note.lessonId));
      db.quizAttempts = db.quizAttempts.filter((attempt) => !ids.has(attempt.lessonId));
    });
    for (const id of ids) uploadTokens.delete(id);
  }

  function finishProcessing(lessonId: string, token: number): void {
    if (uploadTokens.get(lessonId) !== token) return;
    uploadTokens.delete(lessonId);
    try {
      const { lesson } = findLesson(store.db, lessonId);
      if (lesson.type !== 'video' || lesson.video?.status !== 'processing') return;
      store.mutate(() => {
        lesson.video = {
          provider: 'local',
          externalId: null,
          status: 'ready',
          playbackUrl: SAMPLE_VIDEO_URL,
        };
      });
    } catch {
      // the lesson was deleted while its video was processing
    }
  }

  function applyLessonUpdate(lesson: Lesson, input: UpdateLessonInput): void {
    if (
      input.durationSeconds !== undefined &&
      !durationSchema.safeParse(input.durationSeconds).success
    ) {
      throw new ServiceError('validation', 'Invalid duration');
    }
    if (input.captions !== undefined && lesson.type !== 'video') {
      throw new ServiceError('validation', 'Only video lessons have captions');
    }
    if (input.quiz !== undefined && lesson.type !== 'quiz') {
      throw new ServiceError('validation', 'Only quiz lessons have a quiz');
    }
    const quiz = input.quiz === undefined ? undefined : quizSchema.safeParse(input.quiz);
    if (quiz && !quiz.success) throw new ServiceError('validation', 'Invalid quiz');

    if (input.translations) mergeByLocale(lesson.translations, input.translations);
    if (input.durationSeconds !== undefined) lesson.durationSeconds = input.durationSeconds;
    if (input.captions !== undefined && lesson.type === 'video') {
      lesson.captions = clone(input.captions);
    }
    if (quiz?.success && lesson.type === 'quiz') lesson.quiz = quiz.data;
  }

  return {
    createModule: (input) =>
      context.run('curriculum.createModule', () => {
        const course = findCourseById(store.db, input.courseId);
        requireManager(course);
        const title = input.title.trim();
        if (title === '') throw new ServiceError('validation', 'Title is required');

        const courseModule: CourseModuleWithLessons = {
          id: store.nextId('module'),
          courseId: course.id,
          order: course.modules.length,
          translations: [{ locale: input.locale, title }],
          lessons: [],
        };
        const updated = changeCourse(course, (target) => target.modules.push(courseModule));
        return { course: updated, moduleId: courseModule.id };
      }),

    updateModule: (moduleId, input) =>
      context.run('curriculum.updateModule', () => {
        const { course, courseModule } = findModule(store.db, moduleId);
        return changeCourse(course, () => {
          mergeByLocale(
            courseModule.translations,
            input.translations.map((item) => ({ ...item, title: item.title.trim() })),
          );
        });
      }),

    deleteModule: (moduleId) =>
      context.run('curriculum.deleteModule', () => {
        const { course, courseModule } = findModule(store.db, moduleId);
        const lessonIds = courseModule.lessons.map((lesson) => lesson.id);
        const updated = changeCourse(course, (target) => {
          target.modules = target.modules.filter((candidate) => candidate.id !== moduleId);
        });
        removeLessonData(lessonIds);
        return updated;
      }),

    createLesson: (input) =>
      context.run('curriculum.createLesson', () => {
        const { course, courseModule } = findModule(store.db, input.moduleId);
        requireManager(course);
        const title = input.title.trim();
        if (title === '') throw new ServiceError('validation', 'Title is required');

        const base = {
          id: store.nextId('lesson'),
          moduleId: courseModule.id,
          order: courseModule.lessons.length,
          durationSeconds: 0,
          attachments: [],
          translations: [{ locale: input.locale, title, content: '' }],
        };
        const lesson: Lesson =
          input.type === 'video'
            ? { ...base, type: 'video', video: null, captions: [] }
            : input.type === 'quiz'
              ? {
                  ...base,
                  type: 'quiz',
                  quiz: { passingScore: DEFAULT_PASSING_SCORE, questions: [] },
                }
              : { ...base, type: input.type };
        const updated = changeCourse(course, () => courseModule.lessons.push(lesson));
        return { course: updated, lessonId: lesson.id };
      }),

    updateLesson: (lessonId, input) =>
      context.run('curriculum.updateLesson', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        requireManager(course);
        return changeCourse(course, () => applyLessonUpdate(lesson, input));
      }),

    addLessonAttachments: (lessonId, files) =>
      context.run('curriculum.addLessonAttachments', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        requireManager(course);
        const added = files.map((file) => ({
          id: store.nextId('attachment'),
          name: file.name,
          sizeBytes: file.sizeBytes,
          url: file.url,
        }));
        if (!z.array(fileAttachmentSchema).safeParse(added).success) {
          throw new ServiceError('validation', 'Invalid attachments');
        }
        return changeCourse(course, () => lesson.attachments.push(...added));
      }),

    removeLessonAttachment: (lessonId, attachmentId) =>
      context.run('curriculum.removeLessonAttachment', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        requireManager(course);
        return changeCourse(course, () => {
          lesson.attachments = lesson.attachments.filter((item) => item.id !== attachmentId);
        });
      }),

    deleteLesson: (lessonId) =>
      context.run('curriculum.deleteLesson', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        const updated = changeCourse(course, (target) => {
          const owner = target.modules.find((candidate) => candidate.id === lesson.moduleId);
          if (owner) owner.lessons = owner.lessons.filter((candidate) => candidate.id !== lessonId);
        });
        removeLessonData([lessonId]);
        return updated;
      }),

    setLessonVideo: (lessonId, source) =>
      context.run('curriculum.setLessonVideo', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        requireManager(course);
        if (lesson.type !== 'video') {
          throw new ServiceError('validation', 'Only video lessons have a video');
        }

        if (source.provider === 'external') {
          let url: URL;
          try {
            url = new URL(source.url.trim());
          } catch {
            throw new ServiceError('validation', 'Invalid video URL');
          }
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new ServiceError('validation', 'Invalid video URL');
          }
          uploadTokens.delete(lessonId);
          return changeCourse(course, () => {
            lesson.video = {
              provider: 'external',
              externalId: url.toString(),
              status: 'ready',
              playbackUrl: url.toString(),
            };
          });
        }

        if (!VIDEO_FILE_PATTERN.test(source.fileName)) {
          throw new ServiceError('validation', 'Unsupported video format');
        }
        const token = ++uploadCounter;
        uploadTokens.set(lessonId, token);
        const instant = context.videoProcessingMs <= 0;
        const updated = changeCourse(course, () => {
          lesson.video = instant
            ? { provider: 'local', externalId: null, status: 'ready', playbackUrl: SAMPLE_VIDEO_URL }
            : { provider: 'local', externalId: null, status: 'processing', playbackUrl: null };
        });
        if (instant) uploadTokens.delete(lessonId);
        else setTimeout(() => finishProcessing(lessonId, token), context.videoProcessingMs);
        return updated;
      }),

    removeLessonVideo: (lessonId) =>
      context.run('curriculum.removeLessonVideo', () => {
        const { course, lesson } = findLesson(store.db, lessonId);
        if (lesson.type !== 'video') {
          throw new ServiceError('validation', 'Only video lessons have a video');
        }
        uploadTokens.delete(lessonId);
        return changeCourse(course, () => {
          lesson.video = null;
        });
      }),

    reorder: (courseId, layout: CurriculumLayoutItem[]) =>
      context.run('curriculum.reorder', () => {
        const course = findCourseById(store.db, courseId);
        requireManager(course);

        const modulesById = new Map(course.modules.map((item) => [item.id, item]));
        const lessonsById = new Map(
          course.modules.flatMap((item) => item.lessons).map((lesson) => [lesson.id, lesson]),
        );
        const layoutLessonIds = layout.flatMap((item) => item.lessonIds);
        const coversEverything =
          layout.length === modulesById.size &&
          new Set(layout.map((item) => item.moduleId)).size === modulesById.size &&
          layout.every((item) => modulesById.has(item.moduleId)) &&
          layoutLessonIds.length === lessonsById.size &&
          new Set(layoutLessonIds).size === lessonsById.size &&
          layoutLessonIds.every((id) => lessonsById.has(id));
        if (!coversEverything) {
          throw new ServiceError('validation', 'The layout must list every module and lesson once');
        }

        return changeCourse(course, (target) => {
          target.modules = layout.map((item) => {
            const courseModule = modulesById.get(item.moduleId)!;
            courseModule.lessons = item.lessonIds.map((id) => lessonsById.get(id)!);
            return courseModule;
          });
        });
      }),
  };
}
