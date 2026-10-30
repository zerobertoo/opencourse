import { z } from 'zod';
import { idSchema, isoDateSchema, localeSchema, roleSchema } from './base';
import { defaultEnabledVideoProviders, findVideoProvider } from './video-providers';

// ---------- Users ----------

export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  email: z.email(),
  avatarUrl: z.string().nullable(),
  role: roleSchema,
  locale: localeSchema,
  timeZone: z.string().min(1),
  active: z.boolean(),
  createdAt: isoDateSchema,
});
export type User = z.infer<typeof userSchema>;

// ---------- Courses ----------

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string(),
  description: z.string(),
  /** "What you will learn". */
  learningOutcomes: z.array(z.string()),
});
export type CourseTranslation = z.infer<typeof courseTranslationSchema>;

/** Certificate template of a course: who signs it and an optional custom message. */
export const certificateTemplateSchema = z.object({
  /** When false, completing the course does not issue a certificate. */
  enabled: z.boolean(),
  signatoryName: z.string(),
  signatoryRole: z.string(),
  message: z.string(),
});
export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

export const courseSchema = z.object({
  id: idSchema,
  slug: z.string().min(1),
  status: courseStatusSchema,
  coverImageUrl: z.string().nullable(),
  instructorId: idSchema,
  defaultLocale: localeSchema,
  /** When true, the next lesson only unlocks after the previous one is completed. */
  sequentialOrder: z.boolean(),
  certificateTemplate: certificateTemplateSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  translations: z.array(courseTranslationSchema),
});
export type Course = z.infer<typeof courseSchema>;

// ---------- Quiz ----------

export const quizOptionSchema = z.object({
  id: idSchema,
  /** Absent in responses to people who cannot manage the course, so answers never leak. */
  isCorrect: z.boolean().optional(),
  translations: z.array(z.object({ locale: localeSchema, text: z.string() })),
});
export type QuizOption = z.infer<typeof quizOptionSchema>;

export const quizQuestionSchema = z.object({
  id: idSchema,
  translations: z.array(
    z.object({ locale: localeSchema, prompt: z.string(), explanation: z.string() }),
  ),
  /** Multiple choice with a single correct option. */
  options: z.array(quizOptionSchema).min(2),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizSchema = z.object({
  /** Minimum passing score, from 0 to 100. */
  passingScore: z.number().int().min(0).max(100),
  questions: z.array(quizQuestionSchema),
});
export type Quiz = z.infer<typeof quizSchema>;

// ---------- Lessons and modules ----------

export const lessonTypeSchema = z.enum(['video', 'text', 'file', 'quiz']);
export type LessonType = z.infer<typeof lessonTypeSchema>;

export const lessonTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string(),
  /** Markdown: body of a text lesson or description of the other types. */
  content: z.string(),
});
export type LessonTranslation = z.infer<typeof lessonTranslationSchema>;

export const videoAssetStatusSchema = z.enum(['uploading', 'processing', 'ready', 'error']);

/** A video sent to this instance: transcoded to HLS by the worker and played through the API. */
export const localVideoAssetSchema = z.object({
  provider: z.literal('local'),
  assetId: idSchema,
  status: videoAssetStatusSchema,
  /** Why processing failed; only set when the status is `error`. */
  errorMessage: z.string().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
});
export type LocalVideoAsset = z.infer<typeof localVideoAssetSchema>;

/** A link to a provider handled by a video provider plugin (see `video-providers`). */
export const externalVideoAssetSchema = z.object({
  provider: z.literal('external'),
  /** Id of the plugin that recognised the link, e.g. `youtube`. */
  plugin: z.string().min(1),
  externalId: z.string().min(1),
  embedUrl: z.string(),
  /** Always ready: the provider does the processing. */
  status: z.literal('ready'),
});
export type ExternalVideoAsset = z.infer<typeof externalVideoAssetSchema>;

export const videoAssetSchema = z.discriminatedUnion('provider', [
  localVideoAssetSchema,
  externalVideoAssetSchema,
]);
export type VideoAsset = z.infer<typeof videoAssetSchema>;

export const captionSchema = z.object({ locale: localeSchema, url: z.string() });
export type Caption = z.infer<typeof captionSchema>;

export const fileAttachmentSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string(),
});
export type FileAttachment = z.infer<typeof fileAttachmentSchema>;

const lessonBaseSchema = z.object({
  id: idSchema,
  moduleId: idSchema,
  order: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  translations: z.array(lessonTranslationSchema),
  /** Downloadable materials shown in the "Materials" tab (and the content of a file lesson). */
  attachments: z.array(fileAttachmentSchema),
});

export const lessonSchema = z.discriminatedUnion('type', [
  lessonBaseSchema.extend({
    type: z.literal('video'),
    /** Null until the instructor adds a video. */
    video: videoAssetSchema.nullable(),
    captions: z.array(captionSchema),
  }),
  lessonBaseSchema.extend({ type: z.literal('text') }),
  lessonBaseSchema.extend({ type: z.literal('file') }),
  lessonBaseSchema.extend({ type: z.literal('quiz'), quiz: quizSchema }),
]);
export type Lesson = z.infer<typeof lessonSchema>;

export const moduleSchema = z.object({
  id: idSchema,
  courseId: idSchema,
  order: z.number().int().nonnegative(),
  translations: z.array(z.object({ locale: localeSchema, title: z.string() })),
});
export type CourseModule = z.infer<typeof moduleSchema>;

export const moduleWithLessonsSchema = moduleSchema.extend({ lessons: z.array(lessonSchema) });
export type CourseModuleWithLessons = z.infer<typeof moduleWithLessonsSchema>;

/** Course with its full curriculum (orderable modules and lessons). */
export const courseDetailSchema = courseSchema.extend({
  modules: z.array(moduleWithLessonsSchema),
  /** Who teaches it, so students need not read the user (`GET /users/:id` is closed to them). */
  instructor: z.object({ id: idSchema, name: z.string() }).optional(),
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

// ---------- Access (grants) ----------

/** `plugin` is reserved for integrations that create grants through the API or domain events. */
export const grantSourceSchema = z.enum(['manual', 'invite', 'plugin']);
export type GrantSource = z.infer<typeof grantSourceSchema>;

export const grantStatusSchema = z.enum(['active', 'revoked', 'expired']);
export type GrantStatus = z.infer<typeof grantStatusSchema>;

/** Access grant to a course. A null `expiresAt` means lifetime access. */
export const grantSchema = z.object({
  id: idSchema,
  userId: idSchema,
  courseId: idSchema,
  source: grantSourceSchema,
  createdById: idSchema,
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema.nullable(),
  status: grantStatusSchema,
});
export type Grant = z.infer<typeof grantSchema>;

export const inviteStatusSchema = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

/**
 * An invite as listed to instructors and admins. The secret token never travels in this shape:
 * the acceptance link is only returned once, when the invite is created.
 */
export const inviteSchema = z.object({
  id: idSchema,
  email: z.email(),
  /** When set, accepting the invite grants access to this course. */
  courseId: idSchema.nullable(),
  createdById: idSchema,
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema,
  status: inviteStatusSchema,
});
export type Invite = z.infer<typeof inviteSchema>;

// ---------- Progress and certificates ----------

/** Identified by the (userId, lessonId) pair: one record per student and lesson. */
export const progressSchema = z.object({
  userId: idSchema,
  lessonId: idSchema,
  completed: z.boolean(),
  videoPositionSeconds: z.number().nonnegative(),
  updatedAt: isoDateSchema,
});
export type Progress = z.infer<typeof progressSchema>;

export const quizAttemptSchema = z.object({
  id: idSchema,
  userId: idSchema,
  lessonId: idSchema,
  /** Question -> chosen option. */
  answers: z.record(z.string(), z.string()),
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  createdAt: isoDateSchema,
});
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;

/** A student's personal note on a lesson, identified by the (userId, lessonId) pair. */
export const lessonNoteSchema = z.object({
  userId: idSchema,
  lessonId: idSchema,
  content: z.string(),
  updatedAt: isoDateSchema,
});
export type LessonNote = z.infer<typeof lessonNoteSchema>;

export const certificateSchema = z.object({
  id: idSchema,
  userId: idSchema,
  courseId: idSchema,
  /** Public code for the verification page. */
  code: z.string().min(1),
  issuedAt: isoDateSchema,
});
export type Certificate = z.infer<typeof certificateSchema>;

// ---------- Instance settings ----------

export const platformSettingsSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  enabledLocales: z.array(localeSchema).min(1),
  defaultLocale: localeSchema,
  email: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    username: z.string(),
    fromAddress: z.string(),
    secure: z.boolean(),
  }),
  // settings saved before this group existed still parse, with the watermark off; those saved
  // before the single-stream option still parse too, with it on, and before the provider list
  // with the default providers
  video: z
    .object({
      watermarkEnabled: z.boolean(),
      singleStreamEnabled: z.boolean().default(true),
      // ids of the providers that accept new links; lessons that already use another one keep playing
      enabledVideoProviders: z.array(z.string()).default([...defaultEnabledVideoProviders]),
    })
    .default({
      watermarkEnabled: false,
      singleStreamEnabled: true,
      enabledVideoProviders: [...defaultEnabledVideoProviders],
    }),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

// The name may not hold characters the mail library reads as address-list syntax (`,` `;` `@`,
// quotes), so one value can never turn into several From addresses.
const DISPLAY_NAME_ADDRESS = /^[^<>\r\n,;:"@\\]*<([^<>\s]+)>$/;

/** True for `user@host`, `<user@host>` and `Display Name <user@host>`, the forms accepted as `From`. */
export function isSenderAddress(value: string): boolean {
  const trimmed = value.trim();
  const bare = DISPLAY_NAME_ADDRESS.exec(trimmed)?.[1] ?? trimmed;
  return z.email().safeParse(bare).success;
}

/** True for an absolute http or https address; anything else (`javascript:`, `data:`) is refused. */
export function isHttpUrl(value: string): boolean {
  return z.url({ protocol: /^https?$/ }).safeParse(value).success;
}

/** Merged-then-validated by the server, so every group may carry only the fields that change. */
export const updatePlatformSettingsRequestSchema = z
  .object({
    brand: platformSettingsSchema.shape.brand
      .extend({ logoUrl: z.string().refine(isHttpUrl, 'Enter an http(s) address').nullable() })
      .partial()
      .strict()
      .optional(),
    enabledLocales: platformSettingsSchema.shape.enabledLocales.optional(),
    defaultLocale: localeSchema.optional(),
    email: platformSettingsSchema.shape.email
      .extend({
        fromAddress: z.string().trim().refine(isSenderAddress, 'Enter an e-mail, or Name <e-mail>'),
      })
      .partial()
      .strict()
      .optional(),
    // plain booleans: a default inside a patch would overwrite a stored value that was left out
    video: z
      .object({
        watermarkEnabled: z.boolean(),
        singleStreamEnabled: z.boolean(),
        enabledVideoProviders: z.array(
          z.string().refine((id) => findVideoProvider(id) !== undefined, 'Unknown video provider'),
        ),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsRequestSchema>;

/** Why a settings change was refused, or null when the default language is among the enabled ones. */
export function platformSettingsProblem(settings: PlatformSettings): string | null {
  return settings.enabledLocales.includes(settings.defaultLocale)
    ? null
    : 'The default language must be enabled';
}
