import type {
  CertificateTemplate,
  CourseDetail,
  CourseStatus,
  CourseTranslation,
  Locale,
} from '@opencourse/shared';

export interface CourseFilters {
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
  list(filters?: CourseFilters): Promise<CourseDetail[]>;
  /** Throws `not_found` when the course does not exist. */
  getBySlug(slug: string): Promise<CourseDetail>;
  getById(id: string): Promise<CourseDetail>;
  /** Creates a draft for the authenticated instructor. */
  create(input: CreateCourseInput): Promise<CourseDetail>;
  update(id: string, input: UpdateCourseInput): Promise<CourseDetail>;
}
