import {
  acceptInviteRequestSchema,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
} from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { acceptInviteSchema, signUpSchema } from './schemas';

const email = 'maria@example.com';
const passwordLengths = [
  PASSWORD_MIN_LENGTH - 1,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_LENGTH + 1,
];
const nameLengths = [0, 1, NAME_MAX_LENGTH, NAME_MAX_LENGTH + 1];

/**
 * A form that accepts what the API rejects ends in a generic error banner instead of a message
 * next to the field. These tests pin the two sides to the same rules.
 */
describe('form schemas agree with the API contract', () => {
  it.each(passwordLengths)('sign-up password of %i characters', (length) => {
    const password = 'p'.repeat(length);
    const form = signUpSchema.safeParse({
      name: 'Maria',
      email,
      password,
      confirmPassword: password,
    });
    const api = registerRequestSchema.safeParse({ name: 'Maria', email, password });
    expect(form.success).toBe(api.success);
  });

  it.each(nameLengths)('sign-up name of %i characters', (length) => {
    const name = 'n'.repeat(length);
    const form = signUpSchema.safeParse({
      name,
      email,
      password: 'long enough password',
      confirmPassword: 'long enough password',
    });
    const api = registerRequestSchema.safeParse({ name, email, password: 'long enough password' });
    expect(form.success).toBe(api.success);
  });

  it.each(passwordLengths)('accept-invite password of %i characters', (length) => {
    const password = 'p'.repeat(length);
    const form = acceptInviteSchema.safeParse({
      name: 'Maria',
      password,
      confirmPassword: password,
    });
    const api = acceptInviteRequestSchema.safeParse({ name: 'Maria', password });
    expect(form.success).toBe(api.success);
  });

  it('names the field when the password is too long, not just a generic error', () => {
    const password = 'p'.repeat(PASSWORD_MAX_LENGTH + 1);
    const result = signUpSchema.safeParse({
      name: 'Maria',
      email,
      password,
      confirmPassword: password,
    });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'password');
    expect(issue?.message).toBe('validation.passwordTooLong');
  });
});
