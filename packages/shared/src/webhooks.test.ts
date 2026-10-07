import { describe, expect, it } from 'vitest';
import { createWebhookRequestSchema, updateWebhookRequestSchema } from './index';

describe('webhook requests', () => {
  const valid = { url: 'https://example.com/hook', events: ['user.created'] };

  it('applies defaults on create', () => {
    const parsed = createWebhookRequestSchema.parse(valid);
    expect(parsed).toMatchObject({ description: '', active: true });
  });

  it('rejects non-http URLs, unknown or repeated events and an empty event list', () => {
    expect(
      createWebhookRequestSchema.safeParse({ ...valid, url: 'ftp://example.com' }).success,
    ).toBe(false);
    expect(createWebhookRequestSchema.safeParse({ ...valid, events: ['nope'] }).success).toBe(
      false,
    );
    expect(
      createWebhookRequestSchema.safeParse({ ...valid, events: ['user.created', 'user.created'] })
        .success,
    ).toBe(false);
    expect(createWebhookRequestSchema.safeParse({ ...valid, events: [] }).success).toBe(false);
  });

  it('accepts a partial update and refuses unknown fields', () => {
    expect(updateWebhookRequestSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateWebhookRequestSchema.safeParse({ secret: 'x' }).success).toBe(false);
  });
});
