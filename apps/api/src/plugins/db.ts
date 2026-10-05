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

/** Opens the Postgres pool, exposes it as `app.db` and closes it with the app. */
export const dbPlugin = fp<{ databaseUrl: string }>(async (app, { databaseUrl }) => {
  const client = postgres(databaseUrl, { max: 10, connect_timeout: 5 });
  app.decorate('db', drizzle(client, { schema }));
  app.addHook('onClose', async () => {
    await client.end({ timeout: 5 });
  });
});
