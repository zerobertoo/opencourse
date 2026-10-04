import { lessonTypeSchema, localeSchema, SUPPORTED_LOCALES, type Locale } from '@opencourse/shared';
import { z } from 'zod';
import { parseClock } from './duration';

// Messages are i18n keys (namespace `common`), translated where the error is rendered.
const required = 'validation.required';
const email = z.email('validation.email');
const newPassword = z.string().min(8, 'validation.passwordLength');

const passwordsMatch = {
  message: 'validation.passwordMismatch',
  path: ['confirmPassword'],
};

export const loginSchema = z.object({
  email,
  password: z.string().min(1, required),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, required),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    name: z.string().trim().min(1, required),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);
export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1, required),
  locale: localeSchema,
  timeZone: z.string().min(1, required),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, required),
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

// ---------- Studio ----------

/** One copy of `schema` for every supported language, keyed by locale. */
function perLocale<T extends z.ZodType>(schema: T) {
  return z.object(
    Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, schema])) as Record<Locale, T>,
  );
}

/** Requires the text in the default language only: other languages may stay empty (incomplete). */
function requireDefaultLocaleText<T extends { defaultLocale: Locale }>(
  field: 'title',
  values: T & { translations: Record<Locale, { title: string }> },
  ctx: z.RefinementCtx,
): void {
  if (values.translations[values.defaultLocale][field].trim() === '') {
    ctx.addIssue({
      code: 'custom',
      message: required,
      path: ['translations', values.defaultLocale, field],
    });
  }
}

export const newCourseSchema = z.object({
  title: z.string().trim().min(1, required),
  description: z.string().trim(),
  defaultLocale: localeSchema,
});
export type NewCourseValues = z.infer<typeof newCourseSchema>;

export const courseDetailsSchema = z
  .object({
    defaultLocale: localeSchema,
    translations: perLocale(
      z.object({ title: z.string(), description: z.string(), learningOutcomes: z.string() }),
    ),
  })
  .superRefine((values, ctx) => requireDefaultLocaleText('title', values, ctx));
export type CourseDetailsValues = z.infer<typeof courseDetailsSchema>;

export const moduleTitlesSchema = z
  .object({ defaultLocale: localeSchema, translations: perLocale(z.object({ title: z.string() })) })
  .superRefine((values, ctx) => requireDefaultLocaleText('title', values, ctx));
export type ModuleTitlesValues = z.infer<typeof moduleTitlesSchema>;

export const newModuleSchema = z.object({ title: z.string().trim().min(1, required) });
export type NewModuleValues = z.infer<typeof newModuleSchema>;

export const newLessonSchema = z.object({
  type: lessonTypeSchema,
  title: z.string().trim().min(1, required),
});
export type NewLessonValues = z.infer<typeof newLessonSchema>;

export const lessonContentSchema = z
  .object({
    defaultLocale: localeSchema,
    duration: z
      .string()
      .trim()
      .refine((value) => parseClock(value) !== null, 'validation.duration'),
    translations: perLocale(z.object({ title: z.string(), content: z.string() })),
  })
  .superRefine((values, ctx) => requireDefaultLocaleText('title', values, ctx));
export type LessonContentValues = z.infer<typeof lessonContentSchema>;

export const externalVideoSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, required)
    .refine((value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'https:' || protocol === 'http:';
      } catch {
        return false;
      }
    }, 'validation.url'),
});
export type ExternalVideoValues = z.infer<typeof externalVideoSchema>;

const CERTIFICATE_MESSAGE_MAX_LENGTH = 280;

export const certificateTemplateFormSchema = z.object({
  enabled: z.boolean(),
  signatoryName: z.string().trim(),
  signatoryRole: z.string().trim(),
  message: z.string().trim().max(CERTIFICATE_MESSAGE_MAX_LENGTH, 'validation.messageTooLong'),
});
export type CertificateTemplateValues = z.infer<typeof certificateTemplateFormSchema>;
export { CERTIFICATE_MESSAGE_MAX_LENGTH };

/** Access duration chosen in the grant form: forever or until a given day. */
const accessFields = {
  access: z.enum(['lifetime', 'until']),
  expiresOn: z.string(),
};

function refineAccessDate(
  values: { access: 'lifetime' | 'until'; expiresOn: string },
  ctx: z.RefinementCtx,
): void {
  if (values.access !== 'until') return;
  const date = new Date(`${values.expiresOn}T23:59:59`);
  if (values.expiresOn === '' || Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'validation.dateRequired', path: ['expiresOn'] });
  } else if (date.getTime() <= Date.now()) {
    ctx.addIssue({ code: 'custom', message: 'validation.dateFuture', path: ['expiresOn'] });
  }
}

export const grantAccessSchema = z
  .object({ userId: z.string().min(1, required), ...accessFields })
  .superRefine(refineAccessDate);
export type GrantAccessValues = z.infer<typeof grantAccessSchema>;

/** End of the chosen day in the user's local time, as ISO; null for lifetime access. */
export function toExpiryIso(values: { access: 'lifetime' | 'until'; expiresOn: string }) {
  return values.access === 'lifetime'
    ? null
    : new Date(`${values.expiresOn}T23:59:59`).toISOString();
}

export const INVITE_VALIDITY_DAYS = ['7', '14', '30'] as const;

export const inviteStudentSchema = z.object({
  email,
  validityDays: z.enum(INVITE_VALIDITY_DAYS),
});
export type InviteStudentValues = z.infer<typeof inviteStudentSchema>;
