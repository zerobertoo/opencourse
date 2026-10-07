import { randomUUID } from 'node:crypto';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';

// these tests talk to the real stack started by `docker compose up -d --build --wait`
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'correct horse battery';

/** A browser stand-in: keeps cookies between requests, like a real session would. */
export class Browser {
  private readonly cookies = new Map<string, string>();

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  async call(method: string, path: string, body?: unknown, options: { csrf?: boolean } = {}) {
    const cookieHeader = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.csrf === false ? {} : { [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ''] = setCookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      // a cleared cookie arrives empty or already expired
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(setCookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as any) : null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export const uniqueEmail = (prefix: string) => `${prefix}.${randomUUID().slice(0, 8)}@e2e.test`;

/** Waits for Mailpit to receive an e-mail for the address and returns its plain-text body. */
export async function waitForMail(address: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const { messages = [] } = (await search.json()) as { messages?: { ID: string }[] };
    if (messages[0]) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      return ((await message.json()) as { Text: string }).Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No e-mail arrived for ${address}`);
}

export const linkIn = (text: string) => /https?:\/\/\S+/.exec(text)![0];

/** The account every e2e file shares, registered once before any of them runs. */
export interface E2eAdmin {
  email: string;
  /** `admin` on a fresh instance; anything else means the database already had users. */
  role: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    e2eAdmin: E2eAdmin;
  }
}
