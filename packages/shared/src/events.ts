import { idSchema } from './base';
import type { CertificateIssuedEvent } from './certificates';
import { z } from 'zod';

/** Typed domain events carried by the internal bus (PRD section 10). */
export const lessonCompletedEventSchema = z.object({
  userId: idSchema,
  courseId: idSchema,
  lessonId: idSchema,
});
export type LessonCompletedEvent = z.infer<typeof lessonCompletedEventSchema>;

export const courseCompletedEventSchema = z.object({
  userId: idSchema,
  courseId: idSchema,
});
export type CourseCompletedEvent = z.infer<typeof courseCompletedEventSchema>;

/** Event name to payload (`certificate.issued` is defined with the certificate schemas). New events are added here so emitters and listeners stay typed. */
export interface DomainEventMap {
  'lesson.completed': LessonCompletedEvent;
  'course.completed': CourseCompletedEvent;
  'certificate.issued': CertificateIssuedEvent;
}
export type DomainEventName = keyof DomainEventMap;
