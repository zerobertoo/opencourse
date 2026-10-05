import { describe, expect, it } from 'vitest';
import {
  listAuditLogQuerySchema,
  listUsersQuerySchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  updateProfileRequestSchema,
} from './index';

describe('auth request schemas', () => {
  it('normalizes the e-mail and trims the name on register', () => {
    const parsed = registerRequestSchema.parse({
      name: '  Maria  ',
      email: '  Maria@Example.COM ',
      password: 'longenough',
    });
    expect(parsed).toEqual({ name: 'Maria', email: 'maria@example.com', password: 'longenough' });
  });

  it('enforces the password policy on register and reset, but not on login', () => {
    const base = { name: 'Maria', email: 'maria@example.com' };
    expect(registerRequestSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(resetPasswordRequestSchema.safeParse({ token: 't', password: 'short' }).success).toBe(
      false,
    );
    expect(loginRequestSchema.safeParse({ email: base.email, password: 'x' }).success).toBe(true);
  });

  it('rejects an oversized password so argon2 never hashes huge input', () => {
    const result = registerRequestSchema.safeParse({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'a'.repeat(1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts real IANA time zones and rejects ones the UI could not format with', () => {
    const base = { name: 'Maria', email: 'maria@example.com', password: 'longenough' };
    for (const timeZone of ['UTC', 'America/Sao_Paulo', 'Europe/Lisbon']) {
      expect(registerRequestSchema.safeParse({ ...base, timeZone }).success).toBe(true);
    }
    for (const timeZone of ['Not/AZone', 'Mars/Olympus', '']) {
      expect(registerRequestSchema.safeParse({ ...base, timeZone }).success).toBe(false);
    }
    expect(updateProfileRequestSchema.safeParse({ timeZone: 'Not/AZone' }).success).toBe(false);
  });

  it('parses boolean text in the users query', () => {
    expect(listUsersQuerySchema.parse({ active: 'false' }).active).toBe(false);
    expect(listUsersQuerySchema.safeParse({ active: 'maybe' }).success).toBe(false);
  });

  it('applies audit pagination defaults and caps', () => {
    expect(listAuditLogQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(listAuditLogQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});
