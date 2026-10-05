import { z } from 'zod';
import { idSchema, localeSchema } from './base';
import {
  certificateTemplateSchema,
  courseDetailSchema,
  courseSchema,
  courseStatusSchema,
  courseTranslationSchema,
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

/** Summaries: the course without its curriculum. */
export const listCoursesResponseSchema = z.object({ courses: z.array(courseSchema) });
export const courseResponseSchema = z.object({ course: courseDetailSchema });

/** Covers are plain https links until the storage adapter exists. */
export const coverImageUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), 'Cover must be an https URL');

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
