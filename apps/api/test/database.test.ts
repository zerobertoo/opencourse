import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import * as schema from '../src/db/schema';

describe('database migrations', () => {
  const databaseUrl = process.env.DATABASE_URL as string;
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await runMigrations(databaseUrl);
  });

  afterAll(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, 'test.key'));
    await client.end();
  });

  it('is idempotent: running twice applies nothing new and does not fail', async () => {
    await expect(runMigrations(databaseUrl)).resolves.toBeUndefined();
  });

  it('creates a settings table that stores and updates JSON values', async () => {
    await db.insert(schema.settings).values({ key: 'test.key', value: { enabled: true } });
    await db
      .update(schema.settings)
      .set({ value: { enabled: false } })
      .where(eq(schema.settings.key, 'test.key'));

    const [row] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'test.key'));
    expect(row?.value).toEqual({ enabled: false });
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });
});
