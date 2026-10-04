import type { LessonNote } from '@opencourse/shared';

export interface NoteService {
  /** The current user's personal note on the lesson, or null if nothing was written yet. */
  getLessonNote(lessonId: string): Promise<LessonNote | null>;
  /** Creates or replaces the note. Empty text removes it. */
  saveLessonNote(lessonId: string, content: string): Promise<LessonNote | null>;
}
