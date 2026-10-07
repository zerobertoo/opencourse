import type { DomainEventMap, DomainEventName } from '@opencourse/shared';
import { outboxEvents } from './db/schema';
import type { Database } from './plugins/db';

export interface PendingEvent<Name extends DomainEventName = DomainEventName> {
  name: Name;
  payload: DomainEventMap[Name];
}

/**
 * Records domain events in the caller's transaction, so they exist exactly when the change that
 * caused them does. The worker relay delivers them to their consumers later.
 */
export async function enqueueEvents(
  tx: Pick<Database, 'insert'>,
  events: readonly PendingEvent[],
): Promise<void> {
  if (events.length === 0) return;
  await tx
    .insert(outboxEvents)
    .values(events.map((event) => ({ name: event.name, payload: event.payload })));
}
