import { idSchema, isoDateSchema, localeSchema } from './base';
import { certificateIssuedEventSchema, type CertificateIssuedEvent } from './certificates';
import { grantSourceSchema } from './entities';
import { videoProcessedEventSchema, type VideoProcessedEvent } from './video';
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

export const userCreatedEventSchema = z.object({
  userId: idSchema,
  name: z.string().min(1),
  email: z.string().min(1),
  locale: localeSchema,
});
export type UserCreatedEvent = z.infer<typeof userCreatedEventSchema>;

export const enrollmentGrantedEventSchema = z.object({
  grantId: idSchema,
  userId: idSchema,
  courseId: idSchema,
  source: grantSourceSchema,
  /** Null for lifetime access. */
  expiresAt: isoDateSchema.nullable(),
});
export type EnrollmentGrantedEvent = z.infer<typeof enrollmentGrantedEventSchema>;

export const grantRevokedEventSchema = z.object({
  grantId: idSchema,
  userId: idSchema,
  courseId: idSchema,
});
export type GrantRevokedEvent = z.infer<typeof grantRevokedEventSchema>;

/** Event name to payload (`certificate.issued` and `video.processed` are defined with their own schemas). New events are added here so emitters and listeners stay typed. */
export interface DomainEventMap {
  'lesson.completed': LessonCompletedEvent;
  'course.completed': CourseCompletedEvent;
  'certificate.issued': CertificateIssuedEvent;
  'user.created': UserCreatedEvent;
  'enrollment.granted': EnrollmentGrantedEvent;
  'grant.revoked': GrantRevokedEvent;
  'video.processed': VideoProcessedEvent;
}
export type DomainEventName = keyof DomainEventMap;

/** Payload schema per event name, so a consumer parses what it reads back from storage. */
export const domainEventPayloadSchemas = {
  'lesson.completed': lessonCompletedEventSchema,
  'course.completed': courseCompletedEventSchema,
  'certificate.issued': certificateIssuedEventSchema,
  'user.created': userCreatedEventSchema,
  'enrollment.granted': enrollmentGrantedEventSchema,
  'grant.revoked': grantRevokedEventSchema,
  'video.processed': videoProcessedEventSchema,
} satisfies { [Name in DomainEventName]: z.ZodType<DomainEventMap[Name]> };

export const domainEventNameSchema = z.enum(
  Object.keys(domainEventPayloadSchemas) as [DomainEventName, ...DomainEventName[]],
);
