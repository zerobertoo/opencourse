import type { CourseDetail, CourseStatus, CourseTranslation, Locale } from '@opencourse/shared';

export interface CourseFilters {
  status?: CourseStatus;
  instructorId?: string;
  /** Busca em qualquer tradução do título do curso. */
  search?: string;
}

export interface CreateCourseInput {
  title: string;
  description?: string;
  defaultLocale: Locale;
}

export interface UpdateCourseInput {
  status?: CourseStatus;
  sequentialOrder?: boolean;
  defaultLocale?: Locale;
  /** Substitui as traduções informadas por idioma; as demais são mantidas. */
  translations?: CourseTranslation[];
}

export interface CourseService {
  list(filters?: CourseFilters): Promise<CourseDetail[]>;
  /** Lança `not_found` quando o curso não existe. */
  getBySlug(slug: string): Promise<CourseDetail>;
  getById(id: string): Promise<CourseDetail>;
  /** Cria um rascunho para o instrutor autenticado. */
  create(input: CreateCourseInput): Promise<CourseDetail>;
  update(id: string, input: UpdateCourseInput): Promise<CourseDetail>;
}
