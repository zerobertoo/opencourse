import type {
  Caption,
  CourseDetail,
  FileAttachment,
  LessonTranslation,
  LessonType,
  Locale,
  Quiz,
} from '@opencourse/shared';

export interface CreateModuleInput {
  courseId: string;
  title: string;
  locale: Locale;
}

export interface UpdateModuleInput {
  /** Replaces the given translations by language; the others are kept. */
  translations: Array<{ locale: Locale; title: string }>;
}

export interface CreateLessonInput {
  moduleId: string;
  type: LessonType;
  title: string;
  locale: Locale;
}

export interface UpdateLessonInput {
  /** Replaces the given translations by language; the others are kept. */
  translations?: LessonTranslation[];
  durationSeconds?: number;
  attachments?: FileAttachment[];
  /** Video lessons only. */
  captions?: Caption[];
  /** Quiz lessons only. */
  quiz?: Quiz;
}

/** Where a video comes from: an upload to the local adapter or a link to an external provider. */
export type LessonVideoSource =
  { provider: 'local'; fileName: string } | { provider: 'external'; url: string };

/** Desired curriculum layout: modules in order, each with its lessons in order. */
export interface CurriculumLayoutItem {
  moduleId: string;
  lessonIds: string[];
}

export interface CurriculumService {
  createModule(input: CreateModuleInput): Promise<{ course: CourseDetail; moduleId: string }>;
  updateModule(moduleId: string, input: UpdateModuleInput): Promise<CourseDetail>;
  /** Also deletes the module's lessons and the progress recorded on them. */
  deleteModule(moduleId: string): Promise<CourseDetail>;
  createLesson(input: CreateLessonInput): Promise<{ course: CourseDetail; lessonId: string }>;
  /** Throws `validation` when a field does not apply to the lesson type. */
  updateLesson(lessonId: string, input: UpdateLessonInput): Promise<CourseDetail>;
  deleteLesson(lessonId: string): Promise<CourseDetail>;
  /** Starts the video upload (status `processing`) or links an external one (`ready`). */
  setLessonVideo(lessonId: string, source: LessonVideoSource): Promise<CourseDetail>;
  removeLessonVideo(lessonId: string): Promise<CourseDetail>;
  /**
   * Batch reordering: applies the module order and moves lessons between modules. The layout
   * must list every module and lesson of the course exactly once.
   */
  reorder(courseId: string, layout: CurriculumLayoutItem[]): Promise<CourseDetail>;
}
