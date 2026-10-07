import fp from 'fastify-plugin';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';

export type Database = PostgresJsDatabase<typeof schema>;

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

/** Opens a Postgres pool. The caller closes it with `close`. */
export function openDatabase(databaseUrl: string, max = 10) {
  const client = postgres(databaseUrl, { max, connect_timeout: 5 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

/** Opens the Postgres pool, exposes it as `app.db` and closes it with the app. */
export const dbPlugin = fp<{ databaseUrl: string }>(async (app, { databaseUrl }) => {
  const { db, close } = openDatabase(databaseUrl);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await close();
  });
});
