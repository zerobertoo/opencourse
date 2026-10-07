import { EventEmitter } from 'node:events';
import type { DomainEventMap, DomainEventName } from '@opencourse/shared';
import fp from 'fastify-plugin';

export interface EventBus {
  /** Delivers the event to its listeners. A failing listener is logged, never thrown at the caller. */
  emit<Name extends DomainEventName>(name: Name, payload: DomainEventMap[Name]): void;
  on<Name extends DomainEventName>(
    name: Name,
    listener: (payload: DomainEventMap[Name]) => void | Promise<void>,
  ): void;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Internal typed bus for domain events. In-process only: no queue and no retries yet. */
    events: EventBus;
  }
}

export const eventsPlugin = fp(async (app) => {
  const emitter = new EventEmitter();

  app.decorate('events', {
    emit(name, payload) {
      for (const listener of emitter.listeners(name)) {
        Promise.resolve()
          .then(() => (listener as (value: unknown) => unknown)(payload))
          .catch((error: unknown) =>
            app.log.error({ err: error, event: name }, 'domain event listener failed'),
          );
      }
    },
    on(name, listener) {
      emitter.on(name, listener as (value: unknown) => void);
    },
  } satisfies EventBus);
});
