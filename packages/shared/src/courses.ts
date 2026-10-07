import { z } from 'zod';
import { idSchema, localeSchema } from './base';
import {
  certificateTemplateSchema,
  courseDetailSchema,
  courseSchema,
  courseStatusSchema,
  courseTranslationSchema,
  grantSchema,
} from './entities';

export const courseIdParamsSchema = z.object({ id: idSchema });
export const courseSlugParamsSchema = z.object({ slug: z.string().min(1).max(120) });

/** `catalog` lists what the caller may open; `managed` lists what they can edit (Studio). */
export const listCoursesQuerySchema = z.object({
  scope: z.enum(['catalog', 'managed']).default('catalog'),
  status: courseStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

/**
 * A course in a list: no curriculum, but enough to draw a card. `myGrant` is the caller's own open
 * grant (its effective status included) or null, so a student's list says what they can open
 * without a second request.
 */
export const listedCourseSchema = courseSchema.extend({
  moduleCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  completeLocales: z.array(localeSchema),
  myGrant: grantSchema.nullable(),
});
export type ListedCourse = z.infer<typeof listedCourseSchema>;

export const listCoursesResponseSchema = z.object({ courses: z.array(listedCourseSchema) });
export const courseResponseSchema = z.object({ course: courseDetailSchema });

/** Links to files hosted elsewhere: https only until the storage adapter exists (milestone 4b). */
export const httpsUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), 'Must be an https URL');

export const coverImageUrlSchema = httpsUrlSchema;

export const createCourseRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  defaultLocale: localeSchema,
});
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;

export const updateCourseRequestSchema = z
  .object({
    status: courseStatusSchema,
    sequentialOrder: z.boolean(),
    defaultLocale: localeSchema,
    coverImageUrl: coverImageUrlSchema.nullable(),
    certificateTemplate: certificateTemplateSchema,
    /** Merged by locale: the given languages are replaced, the others are kept. */
    translations: z
      .array(courseTranslationSchema)
      .max(10)
      .refine(
        (items) => new Set(items.map((item) => item.locale)).size === items.length,
        'Each locale can appear only once',
      ),
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to update');
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;
