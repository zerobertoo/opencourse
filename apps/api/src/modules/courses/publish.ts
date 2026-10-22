import { isDeepStrictEqual } from 'node:util';
import {
  flattenLessons,
  getPublishIssues,
  getQuizIssues,
  type CourseDetail,
  type PublishIssue,
} from '@opencourse/shared';
import { badRequest } from '../../errors';

/**
 * True when the edit saved a quiz students could not pass: one the edit changed, or a lesson it
 * created, that still has questions but breaks a quiz rule (no correct option, two of them, a
 * prompt without text...). A lesson that starts out empty, or a quiz the edit did not touch,
 * stays tolerated: those are lessons still being prepared.
 */
function leavesBrokenQuiz(before: CourseDetail, after: CourseDetail): boolean {
  const previous = new Map(flattenLessons(before).map((lesson) => [lesson.id, lesson]));
  return flattenLessons(after).some((lesson) => {
    if (lesson.type !== 'quiz' || getQuizIssues(lesson.quiz, after.defaultLocale).length === 0) {
      return false;
    }
    const old = previous.get(lesson.id);
    const wasEmpty = !old || (old.type === 'quiz' && old.quiz.questions.length === 0);
    if (lesson.quiz.questions.length === 0 && wasEmpty) return false;
    return !(old?.type === 'quiz' && isDeepStrictEqual(old.quiz, lesson.quiz));
  });
}

/**
 * Keeps published courses publishable. Publishing needs a course without issues. Once
 * published, an edit may not add an issue the course did not already have: deleting the last
 * lesson or wiping a title is refused, while a lesson whose video or quiz is still being
 * prepared does not freeze the rest of the course. A quiz is judged on its own, though: an
 * edit that changes it may not leave it broken, even when another quiz is still empty.
 *
 * @param before the course before the edit, only when it was already published; otherwise null
 * @param after the course as the edit leaves it
 */
export function assertPublishable(before: CourseDetail | null, after: CourseDetail): void {
  if (after.status !== 'published') return;
  const tolerated = new Set<PublishIssue>(before ? getPublishIssues(before) : []);
  const issues = getPublishIssues(after).filter((issue) => !tolerated.has(issue));
  if (before && !issues.includes('invalidQuiz') && leavesBrokenQuiz(before, after)) {
    issues.push('invalidQuiz');
  }
  // throwing inside the transaction rolls the whole edit back
  if (issues.length > 0) throw badRequest('Course cannot be published yet', { issues });
}
