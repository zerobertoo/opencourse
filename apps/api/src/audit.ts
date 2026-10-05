import { auditLog } from './db/schema';
import type { Database } from './plugins/db';

export interface AuditEvent {
  /** Null for system-initiated actions. */
  actorId: string | null;
  /** Dotted verb, such as `user.role_changed`. */
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
}

/** Records an administrative action. Accepts a transaction so it commits with the change itself. */
export async function recordAudit(db: Pick<Database, 'insert'>, event: AuditEvent): Promise<void> {
  await db.insert(auditLog).values({
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata ?? {},
  });
}
