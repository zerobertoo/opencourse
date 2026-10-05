import postgres from 'postgres';
import { runMigrations } from '../src/db/migrate';
import { resolveTestDatabaseUrl } from './database-url';

/** Creates the test database when missing and brings it to the latest migration. */
export default async function globalSetup(): Promise<void> {
  const testUrl = new URL(resolveTestDatabaseUrl());
  const databaseName = testUrl.pathname.slice(1);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (!existing) await admin.unsafe(`create database "${databaseName.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  await runMigrations(testUrl.toString());
}
