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
});
