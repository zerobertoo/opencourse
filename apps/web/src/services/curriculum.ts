import type {
  Caption,
  CourseDetail,
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

/** A file being attached to a lesson; the service assigns the attachment id. */
export interface AttachmentUpload {
  name: string;
  sizeBytes: number;
  /** Where the content is reachable (a data URL in the mock; a real API would upload the file). */
  url: string;
}

export interface UpdateLessonInput {
  /** Replaces the given translations by language; the others are kept. */
  translations?: LessonTranslation[];
  durationSeconds?: number;
  /** Video lessons only. */
  captions?: Caption[];
  /** Quiz lessons only. */
  quiz?: Quiz;
}

/** Where a video comes from: a file to upload to this instance or a link a provider plugin recognises. */
export type LessonVideoSource =
  { provider: 'local'; file: File } | { provider: 'external'; url: string };

export interface SetLessonVideoOptions {
  /** Called with the share of the file already sent, from 0 to 1. Only uploads report it. */
  onProgress?: (fraction: number) => void;
}

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
  addLessonAttachments(lessonId: string, files: AttachmentUpload[]): Promise<CourseDetail>;
  removeLessonAttachment(lessonId: string, attachmentId: string): Promise<CourseDetail>;
  /**
   * Sends the file (it then shows as `processing` until the worker finishes) or links an external
   * video (`ready`). Throws `validation` for a link no provider plugin recognises.
   */
  setLessonVideo(
    lessonId: string,
    source: LessonVideoSource,
    options?: SetLessonVideoOptions,
  ): Promise<CourseDetail>;
  removeLessonVideo(lessonId: string): Promise<CourseDetail>;
  /**
   * Batch reordering: applies the module order and moves lessons between modules. The layout
   * must list every module and lesson of the course exactly once.
   */
  reorder(courseId: string, layout: CurriculumLayoutItem[]): Promise<CourseDetail>;
}
