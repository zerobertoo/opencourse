import type { Progress, QuizAttempt, QuizScore } from '@opencourse/shared';

export interface QuizSubmission {
  attempt: QuizAttempt;
  /** Correção detalhada por pergunta, para exibir o feedback. */
  score: QuizScore;
}

export interface ProgressService {
  /** Registros de progresso do usuário atual em um curso. */
  getCourseProgress(courseId: string): Promise<Progress[]>;
  /** Marca ou desmarca a aula como concluída. Concluir o curso emite o certificado. */
  setLessonCompleted(lessonId: string, completed: boolean): Promise<Progress>;
  saveVideoPosition(lessonId: string, positionSeconds: number): Promise<Progress>;
  /** Corrige o quiz; aprovação conclui a aula. */
  submitQuizAttempt(lessonId: string, answers: Record<string, string>): Promise<QuizSubmission>;
  listQuizAttempts(lessonId: string): Promise<QuizAttempt[]>;
}
