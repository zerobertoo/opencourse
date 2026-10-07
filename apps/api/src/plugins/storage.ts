import fp from 'fastify-plugin';
import type { Storage } from '../storage/s3';

declare module 'fastify' {
  interface FastifyInstance {
    storage: Storage;
  }
}

/** Exposes the object storage as `app.storage`. */
export const storagePlugin = fp<{ storage: Storage }>(async (app, { storage }) => {
  app.decorate('storage', storage);
});
