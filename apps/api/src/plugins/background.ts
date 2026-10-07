import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Runs work after the response is sent. Used where the work would otherwise change the
     * response time depending on private facts (does this e-mail have an account?).
     * Failures are logged, never thrown into the request.
     */
    runInBackground(task: () => Promise<unknown>): void;
    /** Resolves when every background task started so far has finished. Tests and shutdown. */
    settleBackgroundTasks(): Promise<void>;
  }
}

export const backgroundPlugin = fp(async (app) => {
  const pending = new Set<Promise<void>>();

  app.decorate('runInBackground', (task: () => Promise<unknown>) => {
    const running = Promise.resolve()
      .then(task)
      .then(
        () => undefined,
        (error: unknown) => app.log.error({ err: error }, 'background task failed'),
      );
    pending.add(running);
    void running.finally(() => pending.delete(running));
  });

  app.decorate('settleBackgroundTasks', async () => {
    while (pending.size > 0) {
      await Promise.all([...pending]);
      // a finished task may have emitted an event whose listener starts the next one on a later tick
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

  // let in-flight work finish before the connections it uses are closed
  app.addHook('onClose', async () => {
    await app.settleBackgroundTasks();
  });
});
