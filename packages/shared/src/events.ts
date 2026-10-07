import { idSchema } from './base';
import { certificateIssuedEventSchema, type CertificateIssuedEvent } from './certificates';
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

/** Payload schema per event name, so a consumer parses what it reads back from storage. */
export const domainEventPayloadSchemas = {
  'lesson.completed': lessonCompletedEventSchema,
  'course.completed': courseCompletedEventSchema,
  'certificate.issued': certificateIssuedEventSchema,
} satisfies { [Name in DomainEventName]: z.ZodType<DomainEventMap[Name]> };

export const domainEventNameSchema = z.enum(
  Object.keys(domainEventPayloadSchemas) as [DomainEventName, ...DomainEventName[]],
);
