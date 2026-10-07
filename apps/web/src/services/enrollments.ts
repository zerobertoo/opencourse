import type {
  ContinueLearningResponseItem,
  CourseStudentItem,
  EnrolledCourseItem,
} from '@opencourse/shared';

/** A course with an active grant: a summary of the course (no curriculum), the grant and the progress. */
export type EnrolledCourse = EnrolledCourseItem;

/** Next lesson to study, as a summary (no body) with the saved video position. */
export type ContinueLearningItem = ContinueLearningResponseItem;

/** A person with a grant to the course. Only id, name and e-mail travel: that is all a manager needs. */
export type CourseStudent = CourseStudentItem;

export interface EnrollmentService {
  /** Courses with an active grant for the user, with the progress of each one. */
  listMyCourses(): Promise<EnrolledCourse[]>;
  /** Next lesson of the most recent course in progress, or null. */
  getContinueLearning(): Promise<ContinueLearningItem | null>;
  /** True if the current user can read the course content. */
  canAccess(courseId: string): Promise<boolean>;
  /** Course students with progress (course instructor or admin). */
  listCourseStudents(courseId: string): Promise<CourseStudent[]>;
}
