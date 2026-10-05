const DEFAULT_URL = 'postgres://opencourse:opencourse@localhost:5432/opencourse';

/**
 * Tests run in a database of their own (`<name>_test`), because they wipe tables.
 * Pointing them at the development database would delete real accounts.
 */
export function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
  const name = url.pathname.slice(1);
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}
