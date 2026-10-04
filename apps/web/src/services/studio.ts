export interface CourseStats {
  courseId: string;
  /** Students with active access. */
  students: number;
  /** Students with active access who completed every lesson. */
  completedStudents: number;
  /** Fraction from 0 to 1. */
  completionRate: number;
}

export interface StudioDashboard {
  /** Distinct students with active access to the courses the user manages. */
  activeStudents: number;
  publishedCourses: number;
  /** Completed enrollments over active enrollments, from 0 to 1. */
  completionRate: number;
  /** One entry per managed course, whatever its status. */
  courses: CourseStats[];
}

export interface StudioService {
  /** Metrics of the instructor's own courses; admins see every course. */
  getDashboard(): Promise<StudioDashboard>;
}
