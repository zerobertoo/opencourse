import {
  domainEventNameSchema,
  lessonTypeSchema,
  localeSchema,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  videoAdapterSchema,
  roleSchema,
  SUPPORTED_LOCALES,
  type Locale,
} from '@opencourse/shared';
import { z } from 'zod';
import { parseClock } from './duration';

// Messages are i18n keys (namespace `common`), translated where the error is rendered.
const required = 'validation.required';
const email = z.email('validation.email');
// Length rules come from the shared contract, so the forms cannot drift from what the API
// enforces (a form that accepts more than the API shows only a generic error banner).
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.passwordLength')
  .max(PASSWORD_MAX_LENGTH, 'validation.passwordTooLong');
const personName = z
  .string()
  .trim()
  .min(1, required)
  .max(NAME_MAX_LENGTH, 'validation.nameTooLong');

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
    name: personName,
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
    name: personName,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);
export type AcceptInviteValues = z.infer<typeof acceptInviteSchema>;

export const profileSchema = z.object({
  name: personName,
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
        // the API accepts external video links over https only
        return protocol === 'https:';
      } catch {
        return false;
      }
    }, 'validation.httpsUrl'),
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

/** Extends an existing grant: forever or until a given day. */
export const extendGrantSchema = z.object(accessFields).superRefine(refineAccessDate);
export type ExtendGrantValues = z.infer<typeof extendGrantSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date `days` days from now. */
export function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/** Tomorrow as `YYYY-MM-DD`, the earliest expiry a date input should offer. */
export function tomorrowInputValue(): string {
  const tomorrow = new Date(Date.now() + DAY_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
}

// ---------- Admin ----------

export const inviteUserSchema = z.object({
  email,
  validityDays: z.enum(INVITE_VALIDITY_DAYS),
});
export type InviteUserValues = z.infer<typeof inviteUserSchema>;

export const editUserSchema = z.object({ role: roleSchema });
export type EditUserValues = z.infer<typeof editUserSchema>;

const MAX_SMTP_PORT = 65535;

export const platformSettingsFormSchema = z
  .object({
    brandName: z.string().trim().min(1, required),
    logoUrl: z
      .string()
      .trim()
      .refine((value) => value === '' || /^https?:\/\//i.test(value), 'validation.url'),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'validation.color'),
    // An empty checkbox group may arrive as `false`, so every failure maps to the same message.
    enabledLocales: z
      .array(localeSchema, 'validation.localeRequired')
      .min(1, 'validation.localeRequired'),
    defaultLocale: localeSchema,
    videoAdapter: videoAdapterSchema,
    host: z.string().trim(),
    // Kept as text so the field can be emptied while typing; converted on submit.
    port: z
      .string()
      .trim()
      .refine((value) => {
        const port = Number(value);
        return Number.isInteger(port) && port >= 1 && port <= MAX_SMTP_PORT;
      }, 'validation.port'),
    username: z.string().trim(),
    fromAddress: z
      .string()
      .trim()
      .refine((value) => value === '' || z.email().safeParse(value).success, 'validation.email'),
    secure: z.boolean(),
  })
  .refine((values) => values.enabledLocales.includes(values.defaultLocale), {
    message: 'validation.defaultLocaleDisabled',
    path: ['defaultLocale'],
  });
export type PlatformSettingsFormValues = z.infer<typeof platformSettingsFormSchema>;

export const webhookFormSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\/\S+$/i.test(value), 'validation.url'),
  description: z.string().trim().max(200, 'validation.messageTooLong'),
  // An empty checkbox group may arrive as `false`, so every failure maps to the same message.
  events: z
    .array(domainEventNameSchema, 'validation.eventsRequired')
    .min(1, 'validation.eventsRequired'),
});
export type WebhookFormValues = z.infer<typeof webhookFormSchema>;
