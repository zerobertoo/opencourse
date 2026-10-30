import { auditLog } from './db/schema';
import type { Database } from './plugins/db';

/** Every action the audit log records, as `<target>.<verb>`; add new ones here. */
export type AuditAction =
  | 'api_key.created'
  | 'api_key.revoked'
  | 'certificate.issued'
  | 'course.status_changed'
  | 'grant.created'
  | 'grant.extended'
  | 'grant.revoked'
  | 'settings.updated'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.role_changed'
  | 'webhook.created'
  | 'webhook.deleted'
  | 'webhook.secret_rotated'
  | 'webhook.updated';

/** What an action was done to: the part of the action before the dot. */
export type AuditTargetType = AuditAction extends `${infer Target}.${string}` ? Target : never;

export interface AuditEvent {
  /** Null for system-initiated actions. */
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
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
