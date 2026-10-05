import { idSchema } from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { convertIdsToUuids, demoId, generatedId } from './ids';

describe('demo ids', () => {
  it('derives the same valid UUID from the same key', () => {
    expect(demoId('course-javascript')).toBe(demoId('course-javascript'));
    expect(idSchema.safeParse(demoId('course-javascript')).success).toBe(true);
  });

  it('derives different ids for different keys and namespaces', () => {
    expect(demoId('a')).not.toBe(demoId('b'));
    expect(generatedId('course', 1)).not.toBe(demoId('course_1'));
    expect(generatedId('course', 1)).not.toBe(generatedId('course', 2));
  });
});

describe('convertIdsToUuids', () => {
  it('rewrites ids, references and record keys, and leaves other text alone', () => {
    const converted = convertIdsToUuids({
      courses: [{ id: 'c1', title: 'c1 is not a reference here', url: '/media/c1.vtt' }],
      grants: [{ id: 'g1', courseId: 'c1' }],
      answers: { c1: 'g1' },
    });
    expect(converted.courses[0]?.id).toBe(demoId('c1'));
    expect(converted.courses[0]?.title).toBe('c1 is not a reference here');
    expect(converted.courses[0]?.url).toBe('/media/c1.vtt');
    expect(converted.grants[0]).toEqual({ id: demoId('g1'), courseId: demoId('c1') });
    expect(converted.answers).toEqual({ [demoId('c1')]: demoId('g1') });
  });
});
