import {
  domainEventPayloadSchemas,
  pickCertificateTitle,
  type DomainEventMap,
  type DomainEventName,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { certificates, users } from '../db/schema';
import type { Mailer } from '../mail/mailer';
import { certificateEmail } from '../mail/templates';
import { toLocale } from '../mappers';
import { issueCertificate } from '../modules/certificates/service';
import type { Database } from '../plugins/db';

export interface WorkerContext {
  db: Database;
  mailer: Mailer;
  /** Public address of the web app, used to build links in e-mails. */
  webBaseUrl: string;
}

export interface Consumer {
  /** Queue job name; also part of the job id, so keep it stable. */
  name: string;
  event: DomainEventName;
  /** Parses the stored payload, then runs. A throw makes the queue retry the job. */
  run(context: WorkerContext, payload: unknown): Promise<void>;
}

function consumer<Name extends DomainEventName>(
  event: Name,
  name: string,
  handle: (context: WorkerContext, payload: DomainEventMap[Name]) => Promise<void>,
): Consumer {
  return {
    name,
    event,
    run: (context, payload) =>
      handle(context, domainEventPayloadSchemas[event].parse(payload) as DomainEventMap[Name]),
  };
}

/** Everything the worker does in response to a domain event. New consumers are added here. */
export const consumers: readonly Consumer[] = [
  // announces `certificate.issued` through the outbox, in the same transaction as the row
  consumer('course.completed', 'issue-certificate', async ({ db }, { userId, courseId }) => {
    await issueCertificate(db, { userId, courseId, announce: true });
  }),

  // at-least-once: a crash between sending and stamping can mail twice, never zero times
  consumer(
    'certificate.issued',
    'send-certificate-email',
    async ({ db, mailer, webBaseUrl }, { userId, certificateId }) => {
      const [row] = await db.select().from(certificates).where(eq(certificates.id, certificateId));
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!row || !user || row.emailSentAt) return;
      const locale = toLocale(user.locale);
      await mailer.send({
        to: user.email,
        ...certificateEmail(
          locale,
          user.name,
          pickCertificateTitle(row, locale),
          `${webBaseUrl}/certificates`,
        ),
      });
      await db
        .update(certificates)
        .set({ emailSentAt: new Date() })
        .where(eq(certificates.id, certificateId));
    },
  ),
];
