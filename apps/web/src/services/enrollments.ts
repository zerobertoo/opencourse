import type { CourseDetail, CourseProgressSummary, Grant, Lesson, User } from '@opencourse/shared';

export interface EnrolledCourse {
  course: CourseDetail;
  grant: Grant;
  progress: CourseProgressSummary;
  /** Última atividade do aluno no curso, se houver. */
  lastActivityAt: string | null;
}

export interface ContinueLearningItem {
  course: CourseDetail;
  lesson: Lesson;
  progress: CourseProgressSummary;
  /** Posição salva do vídeo, em segundos. */
  videoPositionSeconds: number;
}

export interface CourseStudent {
  user: User;
  grant: Grant;
  progress: CourseProgressSummary;
  lastActivityAt: string | null;
}

export interface EnrollmentService {
  /** Cursos com concessão ativa do usuário, com o progresso de cada um. */
  listMyCourses(): Promise<EnrolledCourse[]>;
  /** Próxima aula do curso em andamento mais recente, ou nulo. */
  getContinueLearning(): Promise<ContinueLearningItem | null>;
  /** Verdadeiro se o usuário atual pode ler o conteúdo do curso. */
  canAccess(courseId: string): Promise<boolean>;
  /** Alunos do curso com progresso (instrutor do curso ou admin). */
  listCourseStudents(courseId: string): Promise<CourseStudent[]>;
}
