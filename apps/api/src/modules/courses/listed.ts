import {
  getCourseSummaryStats,
  type CourseDetail,
  type Grant,
  type ListedCourse,
} from '@opencourse/shared';

/** A course as listed: no curriculum, only its stats, plus the caller's own grant when there is one. */
export function toListedCourse(detail: CourseDetail, myGrant: Grant | null): ListedCourse {
  const { modules, instructor, ...course } = detail;
  void [modules, instructor];
  return { ...course, ...getCourseSummaryStats(detail), myGrant };
}
