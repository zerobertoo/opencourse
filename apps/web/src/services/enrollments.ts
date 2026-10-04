import type { CourseDetail, CourseProgressSummary, Grant, Lesson, User } from '@opencourse/shared';

export interface EnrolledCourse {
  course: CourseDetail;
  grant: Grant;
  progress: CourseProgressSummary;
  /** The student's latest activity in the course, if any. */
  lastActivityAt: string | null;
}

export interface ContinueLearningItem {
  course: CourseDetail;
  lesson: Lesson;
  progress: CourseProgressSummary;
  /** Saved video position, in seconds. */
  videoPositionSeconds: number;
}

export interface CourseStudent {
  user: User;
  grant: Grant;
  progress: CourseProgressSummary;
  lastActivityAt: string | null;
}

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
