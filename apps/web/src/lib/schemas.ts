import { localeSchema } from '@opencourse/shared';
import { z } from 'zod';

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
