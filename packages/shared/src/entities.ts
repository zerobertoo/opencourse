import { z } from 'zod';
import { idSchema, isoDateSchema, localeSchema, roleSchema } from './base';

// ---------- Usuários ----------

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

// ---------- Cursos ----------

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string(),
  description: z.string(),
  /** "O que você vai aprender". */
  learningOutcomes: z.array(z.string()),
});
export type CourseTranslation = z.infer<typeof courseTranslationSchema>;

export const courseSchema = z.object({
  id: idSchema,
  slug: z.string().min(1),
  status: courseStatusSchema,
  coverImageUrl: z.string().nullable(),
  instructorId: idSchema,
  defaultLocale: localeSchema,
  /** Quando verdadeiro, a próxima aula só libera após concluir a anterior. */
  sequentialOrder: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  translations: z.array(courseTranslationSchema),
});
export type Course = z.infer<typeof courseSchema>;

// ---------- Quiz ----------

export const quizOptionSchema = z.object({
  id: idSchema,
  isCorrect: z.boolean(),
  translations: z.array(z.object({ locale: localeSchema, text: z.string() })),
});
export type QuizOption = z.infer<typeof quizOptionSchema>;

export const quizQuestionSchema = z.object({
  id: idSchema,
  translations: z.array(
    z.object({ locale: localeSchema, prompt: z.string(), explanation: z.string() }),
  ),
  /** Múltipla escolha com uma única alternativa correta. */
  options: z.array(quizOptionSchema).min(2),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizSchema = z.object({
  /** Nota mínima para aprovação, de 0 a 100. */
  passingScore: z.number().int().min(0).max(100),
  questions: z.array(quizQuestionSchema),
});
export type Quiz = z.infer<typeof quizSchema>;

// ---------- Aulas e módulos ----------

export const lessonTypeSchema = z.enum(['video', 'text', 'file', 'quiz']);
export type LessonType = z.infer<typeof lessonTypeSchema>;

export const lessonTranslationSchema = z.object({
  locale: localeSchema,
  title: z.string(),
  /** Markdown: corpo da aula de texto ou descrição das demais. */
  content: z.string(),
});
export type LessonTranslation = z.infer<typeof lessonTranslationSchema>;

export const videoAssetSchema = z.object({
  provider: z.enum(['local', 'external']),
  status: z.enum(['uploading', 'processing', 'ready', 'error']),
  playbackUrl: z.string().nullable(),
});
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
  /** Materiais para download exibidos na aba "Materiais" (e conteúdo da aula de arquivo). */
  attachments: z.array(fileAttachmentSchema),
});

export const lessonSchema = z.discriminatedUnion('type', [
  lessonBaseSchema.extend({
    type: z.literal('video'),
    video: videoAssetSchema,
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

/** Curso com currículo completo (módulos e aulas ordenáveis). */
export const courseDetailSchema = courseSchema.extend({
  modules: z.array(moduleWithLessonsSchema),
});
export type CourseDetail = z.infer<typeof courseDetailSchema>;

// ---------- Acesso (grants) ----------

export const grantSourceSchema = z.enum(['manual', 'invite']);
export type GrantSource = z.infer<typeof grantSourceSchema>;

export const grantStatusSchema = z.enum(['active', 'revoked', 'expired']);
export type GrantStatus = z.infer<typeof grantStatusSchema>;

/** Concessão de acesso a um curso. `expiresAt` nulo significa acesso vitalício. */
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

export const inviteSchema = z.object({
  id: idSchema,
  email: z.email(),
  /** Quando informado, aceitar o convite concede acesso a este curso. */
  courseId: idSchema.nullable(),
  token: z.string().min(1),
  createdById: idSchema,
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema,
  status: inviteStatusSchema,
});
export type Invite = z.infer<typeof inviteSchema>;

// ---------- Progresso e certificados ----------

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
  /** Pergunta -> alternativa escolhida. */
  answers: z.record(z.string(), z.string()),
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  createdAt: isoDateSchema,
});
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;

export const certificateSchema = z.object({
  id: idSchema,
  userId: idSchema,
  courseId: idSchema,
  /** Código público para a página de verificação. */
  code: z.string().min(1),
  issuedAt: isoDateSchema,
});
export type Certificate = z.infer<typeof certificateSchema>;

// ---------- Configurações da instância ----------

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
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
