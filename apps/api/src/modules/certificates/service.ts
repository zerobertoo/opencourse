import { randomInt } from 'node:crypto';
import {
  CERTIFICATE_CODE_ALPHABET,
  certificateCodeSchema,
  type CertificateDetails,
  type PublicCertificate,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../audit';
import {
  certificates,
  courses,
  courseTranslations,
  users,
  type CertificateRow,
} from '../../db/schema';
import { isUniqueViolation } from '../../errors';
import { enqueueEvents } from '../../outbox';
import type { Database } from '../../plugins/db';

const CODE_ATTEMPTS = 5;

/** `OC-XXXX-XXXX` from a cryptographic source, with an alphabet that avoids look-alikes. */
export function generateCertificateCode(): string {
  const group = () =>
    Array.from(
      { length: 4 },
      () => CERTIFICATE_CODE_ALPHABET[randomInt(CERTIFICATE_CODE_ALPHABET.length)],
    ).join('');
  return `OC-${group()}-${group()}`;
}

export interface IssueInput {
  userId: string;
  courseId: string;
  /** Marks the audit entry of certificates issued after the fact by the backfill script. */
  backfill?: boolean;
  /** Records `certificate.issued` in the outbox, in the same transaction as the certificate. */
  announce?: boolean;
  /** Replaceable so tests can force a code collision. */
  generateCode?: () => string;
}

/**
 * Issues the certificate of a student for a course, once. Returns the new row, or null when there
 * is nothing to announce: the template is off, the course or user is gone, or the certificate
 * already existed (so a repeated `course.completed` never announces twice).
 */
export async function issueCertificate(
  db: Database,
  input: IssueInput,
): Promise<CertificateRow | null> {
  const {
    userId,
    courseId,
    backfill = false,
    announce = false,
    generateCode = generateCertificateCode,
  } = input;
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!course || !user || !course.certificateTemplate.enabled) return null;

  const translations = await db
    .select()
    .from(courseTranslations)
    .where(eq(courseTranslations.courseId, courseId));
  const courseTitles = Object.fromEntries(translations.map((row) => [row.locale, row.title]));
  const { signatoryName, signatoryRole, message } = course.certificateTemplate;
  const template = { signatoryName, signatoryRole, message };

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generateCode();
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(certificates)
          .values({
            userId,
            courseId,
            code,
            holderName: user.name,
            courseTitles,
            defaultLocale: course.defaultLocale,
            template,
          })
          // only the (student, course) pair means "already issued"; a clash on the code must throw
          .onConflictDoNothing({ target: [certificates.userId, certificates.courseId] })
          .returning();
        if (!row) return null;
        await recordAudit(tx, {
          actorId: null,
          action: 'certificate.issued',
          targetType: 'certificate',
          targetId: row.id,
          metadata: { userId, courseId, code, ...(backfill ? { backfill: true } : {}) },
        });
        if (announce) {
          await enqueueEvents(tx, [
            {
              name: 'certificate.issued',
              payload: { userId, courseId, certificateId: row.id, code },
            },
          ]);
        }
        return row;
      });
    } catch (error) {
      // a taken code: draw another one
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new Error('Could not generate a unique certificate code');
}

export function toCertificateDetails(row: CertificateRow): CertificateDetails {
  return {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId,
    code: row.code,
    issuedAt: row.issuedAt.toISOString(),
    ...toSnapshot(row),
  };
}

export function toPublicCertificate(row: CertificateRow): PublicCertificate {
  return { code: row.code, issuedAt: row.issuedAt.toISOString(), ...toSnapshot(row) };
}

function toSnapshot(row: CertificateRow) {
  return {
    holderName: row.holderName,
    courseTitles: row.courseTitles,
    defaultLocale: row.defaultLocale,
    template: row.template,
  };
}

/** Trims and upper-cases a typed code; anything that is not a well-formed code returns null. */
export function normalizeCertificateCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return certificateCodeSchema.safeParse(code).success ? code : null;
}
