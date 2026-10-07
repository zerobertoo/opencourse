import { describe, expect, it } from 'vitest';
import { domainEventNameSchema, domainEventPayloadSchemas } from './index';

describe('domain event contract', () => {
  it('has a payload schema for every event name', () => {
    expect(domainEventNameSchema.options.sort()).toEqual(
      Object.keys(domainEventPayloadSchemas).sort(),
    );
  });

  it('rejects a payload that does not match its event', () => {
    const userId = '6f1c3a52-2d1c-4a43-9a43-0d3c8b6f9a11';
    expect(domainEventPayloadSchemas['course.completed'].safeParse({ userId }).success).toBe(false);
    expect(
      domainEventPayloadSchemas['course.completed'].safeParse({ userId, courseId: userId }).success,
    ).toBe(true);
  });

  it('parses the payloads of the user and grant events', () => {
    const id = '6f1c3a52-2d1c-4a43-9a43-0d3c8b6f9a11';
    const base = { userId: id, courseId: id, grantId: id };
    expect(
      domainEventPayloadSchemas['user.created'].safeParse({
        userId: id,
        name: 'Ana',
        email: 'ana@example.com',
        locale: 'en',
      }).success,
    ).toBe(true);
    expect(
      domainEventPayloadSchemas['enrollment.granted'].safeParse({
        ...base,
        source: 'manual',
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(domainEventPayloadSchemas['grant.revoked'].safeParse(base).success).toBe(true);
    expect(domainEventPayloadSchemas['grant.revoked'].safeParse({ userId: id }).success).toBe(
      false,
    );
  });
});
