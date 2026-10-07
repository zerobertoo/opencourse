import type { Progress, QuizAttempt, QuizFeedback } from '@opencourse/shared';

export interface QuizSubmission {
  attempt: QuizAttempt;
  /**
   * Grading per question. The right option is only revealed once the attempt passed, so a failed
   * attempt does not hand out the answers.
   */
  feedback: QuizFeedback;
}

export interface ProgressService {
  /** The current user's progress records in a course. */
  getCourseProgress(courseId: string): Promise<Progress[]>;
  /** Marks or unmarks the lesson as completed. Completing the course issues the certificate. */
  setLessonCompleted(lessonId: string, completed: boolean): Promise<Progress>;
  saveVideoPosition(lessonId: string, positionSeconds: number): Promise<Progress>;
  /** Grades the quiz; passing completes the lesson. */
  submitQuizAttempt(lessonId: string, answers: Record<string, string>): Promise<QuizSubmission>;
  listQuizAttempts(lessonId: string): Promise<QuizAttempt[]>;
}
