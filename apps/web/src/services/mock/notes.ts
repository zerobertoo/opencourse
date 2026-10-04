import type { NoteService } from '../notes';
import type { MockContext } from './context';
import { canReadCourse, findLesson } from './helpers';
import { ServiceError } from '../errors';
import { clone } from './store';

export function createMockNoteService(context: MockContext): NoteService {
  const { store } = context;

  /** Resolves the lesson making sure the user can read the course. */
  function requireReadableLesson(lessonId: string) {
    const user = context.requireUser();
    const { course } = findLesson(store.db, lessonId);
    if (!canReadCourse(store.db, user, course, context.now())) {
      throw new ServiceError('forbidden', 'No active grant for this course');
    }
    return user;
  }

  return {
    getLessonNote: (lessonId) =>
      context.run('notes.getLessonNote', () => {
        const user = requireReadableLesson(lessonId);
        const note = store.db.notes.find(
          (entry) => entry.userId === user.id && entry.lessonId === lessonId,
        );
        return note ? clone(note) : null;
      }),

    saveLessonNote: (lessonId, content) =>
      context.run('notes.saveLessonNote', () => {
        const user = requireReadableLesson(lessonId);
        return store.mutate((db) => {
          const index = db.notes.findIndex(
            (entry) => entry.userId === user.id && entry.lessonId === lessonId,
          );
          if (content.trim() === '') {
            if (index >= 0) db.notes.splice(index, 1);
            return null;
          }
          const note = {
            userId: user.id,
            lessonId,
            content,
            updatedAt: context.now().toISOString(),
          };
          if (index >= 0) db.notes[index] = note;
          else db.notes.push(note);
          return clone(note);
        });
      }),
  };
}
