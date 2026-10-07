import { z } from 'zod';
import { idSchema, isoDateSchema, localeSchema } from './base';
import {
  lessonNoteSchema,
  lessonTypeSchema,
  grantSchema,
  progressSchema,
  quizAttemptSchema,
  type Quiz,
} from './entities';
import { listedCourseSchema } from './courses';
import { scoreQuiz } from './content';

/** The quiz lives inside its lesson, so the quiz id in a path is the lesson id. */
export const quizLessonParamsSchema = z.object({ lessonId: idSchema });

// ---------- Progress ----------

/** Either field alone is enough; an empty body is a mistake, not a no-op. */
export const updateProgressRequestSchema = z
  .object({
    completed: z.boolean(),
    videoPositionSeconds: z.number().int().nonnegative(),
  })
  .partial()
  .strict()
  .refine(
    (body) => body.completed !== undefined || body.videoPositionSeconds !== undefined,
    'Send completed, videoPositionSeconds or both',
  );
export type UpdateProgressRequest = z.infer<typeof updateProgressRequestSchema>;

export const progressResponseSchema = z.object({ progress: progressSchema });
export const courseProgressResponseSchema = z.object({ progress: z.array(progressSchema) });

export const courseProgressSummarySchema = z.object({
  completedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  /** Fraction from 0 to 1. */
  percent: z.number().min(0).max(1),
  isComplete: z.boolean(),
  nextLessonId: idSchema.nullable(),
});

// ---------- Quiz attempts ----------

export const submitQuizRequestSchema = z.object({ answers: z.record(idSchema, idSchema) }).strict();
export type SubmitQuizRequest = z.infer<typeof submitQuizRequestSchema>;

/**
 * Feedback for one question, sent only after the student submits. The correct option is revealed
 * once the attempt passed; before that the student learns only whether each answer was right.
 */
export const quizQuestionFeedbackSchema = z.object({
  selectedOptionId: idSchema.nullable(),
  isCorrect: z.boolean(),
  explanation: z.array(z.object({ locale: localeSchema, text: z.string() })),
  correctOptionId: idSchema.optional(),
});
export type QuizQuestionFeedback = z.infer<typeof quizQuestionFeedbackSchema>;

export const quizFeedbackSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  correctCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  results: z.record(idSchema, quizQuestionFeedbackSchema),
});
export type QuizFeedback = z.infer<typeof quizFeedbackSchema>;

/**
 * Grades a quiz for the student who took it. Which option is right stays hidden until the attempt
 * passed, so a failed attempt tells what was wrong but not what to pick.
 */
export function gradeQuiz(quiz: Quiz, answers: Readonly<Record<string, string>>): QuizFeedback {
  const graded = scoreQuiz(quiz, answers);
  return {
    score: graded.score,
    passed: graded.passed,
    correctCount: graded.correctCount,
    totalQuestions: graded.totalQuestions,
    results: Object.fromEntries(
      quiz.questions.map((question) => {
        const result = graded.results[question.id]!;
        return [
          question.id,
          {
            selectedOptionId: result.selectedOptionId,
            isCorrect: result.isCorrect,
            explanation: question.translations.map(({ locale, explanation }) => ({
              locale,
              text: explanation,
            })),
            ...(graded.passed ? { correctOptionId: result.correctOptionId } : {}),
          },
        ];
      }),
    ),
  };
}

export const quizSubmissionResponseSchema = z.object({
  attempt: quizAttemptSchema,
  feedback: quizFeedbackSchema,
});
export type QuizSubmissionResponse = z.infer<typeof quizSubmissionResponseSchema>;

export const listQuizAttemptsResponseSchema = z.object({ attempts: z.array(quizAttemptSchema) });

// ---------- Notes ----------

export const saveNoteRequestSchema = z.object({ content: z.string().max(20000) }).strict();
export type SaveNoteRequest = z.infer<typeof saveNoteRequestSchema>;

/** A null note means nothing is written (or it was just erased by saving empty text). */
export const noteResponseSchema = z.object({ note: lessonNoteSchema.nullable() });

// ---------- Enrollments ----------

/** A lesson without its body, enough to link to it and draw its title. */
export const lessonSummarySchema = z.object({
  id: idSchema,
  type: lessonTypeSchema,
  durationSeconds: z.number().int().nonnegative(),
  translations: z.array(z.object({ locale: localeSchema, title: z.string() })),
});
export type LessonSummary = z.infer<typeof lessonSummarySchema>;

export const enrolledCourseSchema = z.object({
  course: listedCourseSchema,
  grant: grantSchema,
  progress: courseProgressSummarySchema,
  /** The student's latest activity in the course, if any. */
  lastActivityAt: isoDateSchema.nullable(),
});
export type EnrolledCourseItem = z.infer<typeof enrolledCourseSchema>;

export const myCoursesResponseSchema = z.object({ courses: z.array(enrolledCourseSchema) });

export const continueLearningItemSchema = z.object({
  course: listedCourseSchema,
  lesson: lessonSummarySchema,
  progress: courseProgressSummarySchema,
  videoPositionSeconds: z.number().nonnegative(),
});
export type ContinueLearningResponseItem = z.infer<typeof continueLearningItemSchema>;
export const continueLearningResponseSchema = z.object({
  item: continueLearningItemSchema.nullable(),
});

/** What a manager sees of a student: the e-mail only travels on manager-only routes. */
export const courseStudentSchema = z.object({
  user: z.object({ id: idSchema, name: z.string().min(1), email: z.email() }),
  grant: grantSchema,
  progress: courseProgressSummarySchema,
  lastActivityAt: isoDateSchema.nullable(),
});
export type CourseStudentItem = z.infer<typeof courseStudentSchema>;
export const courseStudentsResponseSchema = z.object({ students: z.array(courseStudentSchema) });

// ---------- Studio metrics ----------

export const courseStatsSchema = z.object({
  courseId: idSchema,
  /** Students with active access. */
  students: z.number().int().nonnegative(),
  /** Students with active access who completed every lesson. */
  completedStudents: z.number().int().nonnegative(),
  /** Fraction from 0 to 1. */
  completionRate: z.number().min(0).max(1),
});

export const studioMetricsSchema = z.object({
  /** Distinct students with active access to the courses the caller manages. */
  activeStudents: z.number().int().nonnegative(),
  publishedCourses: z.number().int().nonnegative(),
  /** Completed enrollments over active enrollments, from 0 to 1. */
  completionRate: z.number().min(0).max(1),
  /** One entry per managed course, whatever its status. */
  courses: z.array(courseStatsSchema),
});
export type StudioMetrics = z.infer<typeof studioMetricsSchema>;
