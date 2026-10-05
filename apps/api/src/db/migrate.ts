import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applies pending SQL migrations from `./migrations` (relative to the working directory,
 * which is the api package in development and `/app` in the Docker image).
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  // a dedicated single connection: migrations should not share the app pool
  // `onnotice` silences the harmless "already exists, skipping" notices of repeated runs
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), 'migrations') });
  } finally {
    await client.end();
  }
}

// run as a script (`pnpm db:migrate` or the Compose migrate step)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run migrations');
    process.exit(1);
  }
  runMigrations(databaseUrl)
    .then(() => console.log('Migrations applied'))
    .catch((error: unknown) => {
      console.error('Migration failed', error);
      process.exit(1);
    });
}
