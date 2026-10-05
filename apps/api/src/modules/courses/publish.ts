import { getPublishIssues, type CourseDetail, type PublishIssue } from '@opencourse/shared';
import { badRequest } from '../../errors';

/**
 * Keeps published courses publishable. Publishing needs a course without issues. Once
 * published, an edit may not add an issue the course did not already have: deleting the last
 * lesson or wiping a title is refused, while a lesson whose video or quiz is still being
 * prepared does not freeze the rest of the course.
 *
 * @param before the course before the edit, only when it was already published; otherwise null
 * @param after the course as the edit leaves it
 */
export function assertPublishable(before: CourseDetail | null, after: CourseDetail): void {
  if (after.status !== 'published') return;
  const tolerated = new Set<PublishIssue>(before ? getPublishIssues(before) : []);
  const issues = getPublishIssues(after).filter((issue) => !tolerated.has(issue));
  // throwing inside the transaction rolls the whole edit back
  if (issues.length > 0) throw badRequest('Course cannot be published yet', { issues });
}
