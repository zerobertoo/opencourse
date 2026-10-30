import { hash, verify } from '@node-rs/argon2';

/** Hashes with argon2id and the library defaults (they follow the OWASP minimums). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password against a stored hash. When there is no hash (unknown e-mail), it still
 * spends the same time verifying a throwaway hash, so response time does not reveal which
 * e-mails are registered.
 */
export async function verifyPassword(
  storedHash: string | undefined,
  password: string,
): Promise<boolean> {
  if (storedHash === undefined) {
    dummyHash ??= hashPassword('opencourse-dummy-password');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(storedHash, password).catch(() => false);
}
