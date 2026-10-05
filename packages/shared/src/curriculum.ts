import { z } from 'zod';
import { idSchema, localeSchema } from './base';
import { httpsUrlSchema } from './courses';
import {
  captionSchema,
  courseDetailSchema,
  lessonTranslationSchema,
  lessonTypeSchema,
  quizOptionSchema,
  quizQuestionSchema,
  quizSchema,
} from './entities';

export const moduleIdParamsSchema = z.object({ id: idSchema });
export const lessonIdParamsSchema = z.object({ id: idSchema });

const titleSchema = z.string().trim().min(1).max(200);
/** Existing items may lose their title in a language; the publish check catches the default one. */
const editableTitleSchema = z.string().trim().max(200);

/** One entry per locale, so a merge never has two candidates for the same language. */
function hasUniqueLocales(items: Array<{ locale: string }>): boolean {
  return new Set(items.map((item) => item.locale)).size === items.length;
}
const UNIQUE_LOCALES = 'Each locale can appear only once';

export const createModuleRequestSchema = z
  .object({ title: titleSchema, locale: localeSchema })
  .strict();
export type CreateModuleRequest = z.infer<typeof createModuleRequestSchema>;

export const updateModuleRequestSchema = z
  .object({
    /** Merged by locale: the given languages are replaced, the others are kept. */
    translations: z
      .array(z.object({ locale: localeSchema, title: editableTitleSchema }).strict())
      .min(1)
      .max(10)
      .refine(hasUniqueLocales, UNIQUE_LOCALES),
  })
  .strict();
export type UpdateModuleRequest = z.infer<typeof updateModuleRequestSchema>;

export const createLessonRequestSchema = z
  .object({ type: lessonTypeSchema, title: titleSchema, locale: localeSchema })
  .strict();
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;

/** Question and option ids of a quiz must not repeat. */
function hasUniqueQuizIds(quiz: {
  questions: Array<{ id: string; options: Array<{ id: string }> }>;
}): boolean {
  const all = quiz.questions.flatMap((question) => [
    question.id,
    ...question.options.map((option) => option.id),
  ]);
  return new Set(all).size === all.length;
}

/** A quiz as written by its manager: every option says whether it is the correct one. */
export const quizInputSchema = quizSchema
  .extend({
    questions: z
      .array(
        quizQuestionSchema.extend({
          options: z
            .array(quizOptionSchema.extend({ isCorrect: z.boolean() }))
            .min(2)
            .max(10),
        }),
      )
      .max(100),
  })
  .refine(hasUniqueQuizIds, 'Question and option ids must be unique');
export type QuizInput = z.infer<typeof quizInputSchema>;

export const updateLessonRequestSchema = z
  .object({
    translations: z
      .array(
        lessonTranslationSchema
          .extend({ title: editableTitleSchema, content: z.string().max(100_000) })
          .strict(),
      )
      .min(1)
      .max(10)
      .refine(hasUniqueLocales, UNIQUE_LOCALES),
    durationSeconds: z.number().int().nonnegative().max(86_400),
    /** Video lessons only. */
    captions: z
      .array(captionSchema.extend({ url: httpsUrlSchema }).strict())
      .max(10)
      .refine(hasUniqueLocales, UNIQUE_LOCALES),
    /** Video lessons only: an external link, or null to remove the video. */
    video: z.object({ url: httpsUrlSchema }).strict().nullable(),
    /** Quiz lessons only. */
    quiz: quizInputSchema,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to update');
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;

/** The whole curriculum in its new order; lessons may move between modules. */
export const reorderCurriculumRequestSchema = z
  .object({
    modules: z
      .array(z.object({ moduleId: idSchema, lessonIds: z.array(idSchema).max(500) }).strict())
      .max(200),
  })
  .strict();
export type ReorderCurriculumRequest = z.infer<typeof reorderCurriculumRequestSchema>;

export const createModuleResponseSchema = z.object({
  course: courseDetailSchema,
  moduleId: idSchema,
});
export const createLessonResponseSchema = z.object({
  course: courseDetailSchema,
  lessonId: idSchema,
});
