import type {
  CertificateTemplate,
  CourseDetail,
  CourseStatus,
  CourseTranslation,
  ListedCourse,
  Locale,
} from '@opencourse/shared';

export interface CourseFilters {
  /**
   * `catalog` (default) is what the user may open; `managed` is what they may edit: every course
   * for admins, their own for instructors.
   */
  scope?: 'catalog' | 'managed';
  status?: CourseStatus;
  instructorId?: string;
  /** Searches any translation of the course title. */
  search?: string;
}

export interface CreateCourseInput {
  title: string;
  description?: string;
  defaultLocale: Locale;
}

export interface UpdateCourseInput {
  /** Publishing throws `validation` while `getPublishIssues` reports problems. */
  status?: CourseStatus;
  sequentialOrder?: boolean;
  defaultLocale?: Locale;
  certificateTemplate?: CertificateTemplate;
  /** Replaces the given translations by language; the others are kept. */
  translations?: CourseTranslation[];
}

export interface CourseService {
  /** Summaries without the curriculum: counts and duration travel instead, plus the caller's grant. */
  list(filters?: CourseFilters): Promise<ListedCourse[]>;
  /** Throws `not_found` when the course does not exist. */
  getBySlug(slug: string): Promise<CourseDetail>;
  getById(id: string): Promise<CourseDetail>;
  /** Creates a draft for the authenticated instructor. */
  create(input: CreateCourseInput): Promise<CourseDetail>;
  update(id: string, input: UpdateCourseInput): Promise<CourseDetail>;
}
