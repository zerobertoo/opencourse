import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { courses, grants } from '../../db/schema';
import type { Database } from '../../plugins/db';
import { loadCourseDetails } from '../courses/detail';
import { loadStudentProgress, progressOf, summarizeStudent } from '../progress/stats';
import { issueCertificate } from './service';

/**
 * Issues the certificates people earned before this feature existed, or while the process was down
 * between completing a course and issuing. Everyone who ever held a grant counts (revoking access
 * does not undo a completion). Safe to repeat: the (student, course) pair is unique. Sends no
 * e-mails and no events, and marks the audit entries with `backfill`. Returns how many were issued.
 */
export async function backfillCertificates(db: Database): Promise<number> {
  const rows = await db.select().from(courses);
  // ponytail: one course at a time with its whole curriculum in memory; fine until instances are huge
  const details = await loadCourseDetails(db, rows);
  const holders = await db
    .select({ courseId: grants.courseId, userId: grants.userId })
    .from(grants);

  let issued = 0;
  for (const detail of details) {
    const userIds = [
      ...new Set(holders.filter((grant) => grant.courseId === detail.id).map((g) => g.userId)),
    ];
    const all = await loadStudentProgress(db, [detail.id], userIds);
    for (const userId of userIds) {
      if (!summarizeStudent(detail, progressOf(all, detail.id, userId)).isComplete) continue;
      const row = await issueCertificate(db, { userId, courseId: detail.id, backfill: true });
      if (row) issued += 1;
    }
  }
  return issued;
}

// run as a script (`pnpm --filter @opencourse/api certificates:backfill`)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to backfill certificates');
    process.exit(1);
  }
  const client = postgres(databaseUrl, { max: 2 });
  backfillCertificates(drizzle(client, { schema }))
    .then((issued) => console.log(`Issued ${issued} certificate(s)`))
    .catch((error: unknown) => {
      console.error('Backfill failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => client.end());
}
