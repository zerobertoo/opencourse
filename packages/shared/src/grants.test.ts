import { describe, expect, it } from 'vitest';
import {
  createGrantRequestSchema,
  extendGrantRequestSchema,
  listGrantsQuerySchema,
} from './grants';

const userId = '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e11';
const courseId = '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e12';

describe('grant schemas', () => {
  it('requires uuids and an explicit expiry (null means lifetime) to create a grant', () => {
    expect(createGrantRequestSchema.parse({ userId, courseId, expiresAt: null })).toEqual({
      userId,
      courseId,
      expiresAt: null,
    });
    expect(createGrantRequestSchema.safeParse({ userId, courseId }).success).toBe(false);
    expect(
      createGrantRequestSchema.safeParse({ userId: 'sam@example.com', courseId, expiresAt: null })
        .success,
    ).toBe(false);
    expect(
      createGrantRequestSchema.safeParse({ userId, courseId, expiresAt: 'tomorrow' }).success,
    ).toBe(false);
  });

  it('rejects unknown fields so a client cannot smuggle a source or a creator', () => {
    expect(
      createGrantRequestSchema.safeParse({ userId, courseId, expiresAt: null, source: 'plugin' })
        .success,
    ).toBe(false);
    expect(extendGrantRequestSchema.safeParse({ expiresAt: null, revokedAt: null }).success).toBe(
      false,
    );
  });

  it('accepts a date or null when extending, but not a missing expiry', () => {
    expect(
      extendGrantRequestSchema.safeParse({ expiresAt: '2030-01-01T00:00:00.000Z' }).success,
    ).toBe(true);
    expect(extendGrantRequestSchema.safeParse({ expiresAt: null }).success).toBe(true);
    expect(extendGrantRequestSchema.safeParse({}).success).toBe(false);
  });

  it('filters the listing by course, user and effective status only', () => {
    expect(listGrantsQuerySchema.parse({})).toEqual({});
    expect(listGrantsQuerySchema.parse({ courseId, userId, status: 'expired' })).toEqual({
      courseId,
      userId,
      status: 'expired',
    });
    expect(listGrantsQuerySchema.safeParse({ status: 'pending' }).success).toBe(false);
    expect(listGrantsQuerySchema.safeParse({ courseId: 'nope' }).success).toBe(false);
  });
});
