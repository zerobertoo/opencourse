import { pickCertificateTitle } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { certificates, users } from '../../db/schema';
import { certificateEmail } from '../../mail/templates';
import { toLocale } from '../../mappers';
import { issueCertificate } from './service';

/**
 * Wires certificates to the bus: completing a course issues the certificate, and issuing it sends
 * the e-mail. The row is the source of truth; the e-mail is best effort (one attempt, and
 * `email_sent_at` stays null when it fails).
 */
export function registerCertificateListeners(app: FastifyInstance, webBaseUrl: string): void {
  // tracked as a background task so shutdown (and tests) can wait for the write to land
  app.events.on('course.completed', ({ userId, courseId }) => {
    app.runInBackground(async () => {
      const row = await issueCertificate(app.db, { userId, courseId });
      if (!row) return;
      app.events.emit('certificate.issued', {
        userId,
        courseId,
        certificateId: row.id,
        code: row.code,
      });
    });
  });

  app.events.on('certificate.issued', ({ userId, certificateId }) => {
    app.runInBackground(async () => {
      const [row] = await app.db
        .select()
        .from(certificates)
        .where(eq(certificates.id, certificateId));
      const [user] = await app.db.select().from(users).where(eq(users.id, userId));
      if (!row || !user) return;
      const locale = toLocale(user.locale);
      await app.mailer.send({
        to: user.email,
        ...certificateEmail(
          locale,
          user.name,
          pickCertificateTitle(row, locale),
          `${webBaseUrl}/certificates`,
        ),
      });
      await app.db
        .update(certificates)
        .set({ emailSentAt: new Date() })
        .where(eq(certificates.id, certificateId));
    });
  });
}
