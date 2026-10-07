import type { TestProject } from 'vitest/node';
import { Browser, PASSWORD, uniqueEmail, type E2eAdmin } from './support';

/**
 * Registers the first account before any test file runs. On a fresh instance it becomes the
 * admin, and every file signs in as it (only the very first account of an instance is promoted,
 * so no file can claim it for itself). On a database that already has users it is a plain
 * student and the tests that need an admin skip themselves.
 */
export default async function setup(project: TestProject) {
  const email = uniqueEmail('admin');
  const registered = await new Browser().call('POST', '/auth/register', {
    name: 'Admin Test',
    email,
    password: PASSWORD,
  });
  const admin: E2eAdmin = { email, role: registered.body.user.role };
  project.provide('e2eAdmin', admin);
}
