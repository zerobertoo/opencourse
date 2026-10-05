import { randomUUID } from 'node:crypto';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import { beforeAll, describe, expect, it } from 'vitest';

// these tests talk to the real stack started by `docker compose up -d --build --wait`
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const PASSWORD = 'correct horse battery';

/** A browser stand-in: keeps cookies between requests, like a real session would. */
class Browser {
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

const uniqueEmail = (prefix: string) => `${prefix}.${randomUUID().slice(0, 8)}@e2e.test`;

/** Waits for Mailpit to receive an e-mail for the address and returns its plain-text body. */
async function waitForMail(address: string, timeoutMs = 10_000): Promise<string> {
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

const linkIn = (text: string) => /https?:\/\/\S+/.exec(text)![0];

describe('stack: accounts', () => {
  // registered before every other test: on a fresh instance it is the one that becomes admin
  const admin = { browser: new Browser(), role: '' };

  beforeAll(async () => {
    const registered = await admin.browser.call('POST', '/auth/register', {
      name: 'Admin Test',
      email: uniqueEmail('admin'),
      password: PASSWORD,
    });
    admin.role = registered.body.user.role;
  });
  it('runs the whole session lifecycle: register, read, refresh, sign out', async () => {
    const browser = new Browser();
    const email = uniqueEmail('lifecycle');

    const registered = await browser.call('POST', '/auth/register', {
      name: 'Lifecycle Test',
      email,
      password: PASSWORD,
    });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(email);
    expect(browser.cookie('oc_access')).toBeDefined();

    expect((await browser.call('GET', '/me')).body.user.email).toBe(email);

    const before = browser.cookie('oc_refresh');
    expect((await browser.call('POST', '/auth/refresh')).status).toBe(200);
    expect(browser.cookie('oc_refresh')).not.toBe(before);

    expect((await browser.call('POST', '/auth/logout')).status).toBe(204);
    expect((await browser.call('GET', '/me')).status).toBe(401);

    const again = await browser.call('POST', '/auth/login', { email, password: PASSWORD });
    expect(again.status).toBe(200);
  });

  it('refuses writes without the CSRF header and wrong passwords without hints', async () => {
    const browser = new Browser();
    const email = uniqueEmail('csrf');
    await browser.call('POST', '/auth/register', { name: 'Csrf Test', email, password: PASSWORD });

    const forged = await browser.call('PATCH', '/me', { name: 'Hacked' }, { csrf: false });
    expect(forged.status).toBe(403);

    const wrong = await new Browser().call('POST', '/auth/login', { email, password: 'nope-nope' });
    const unknown = await new Browser().call('POST', '/auth/login', {
      email: uniqueEmail('ghost'),
      password: 'nope-nope',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('recovers a password through the e-mailed link', async () => {
    const email = uniqueEmail('recovery');
    await new Browser().call('POST', '/auth/register', {
      name: 'Recovery Test',
      email,
      password: PASSWORD,
    });

    const anonymous = new Browser();
    expect((await anonymous.call('POST', '/auth/forgot', { email })).status).toBe(204);
    const link = new URL(linkIn(await waitForMail(email)));
    expect(link.pathname).toBe('/reset-password');

    const newPassword = 'a completely new password';
    const reset = await anonymous.call('POST', '/auth/reset', {
      token: link.searchParams.get('token'),
      password: newPassword,
    });
    expect(reset.status).toBe(204);

    expect(
      (await anonymous.call('POST', '/auth/login', { email, password: PASSWORD })).status,
    ).toBe(401);
    expect(
      (await anonymous.call('POST', '/auth/login', { email, password: newPassword })).status,
    ).toBe(200);
  });

  it('invites someone by e-mail and lets them join (needs a fresh instance)', async (context) => {
    // only the very first account of an instance becomes admin, so on a database that already
    // has users this flow cannot run: `docker compose down -v` gives a clean one
    if (admin.role !== 'admin') {
      context.skip();
      return;
    }

    const inviteeEmail = uniqueEmail('invitee');
    const created = await admin.browser.call('POST', '/invites', { email: inviteeEmail });
    expect(created.status).toBe(201);

    const link = linkIn(await waitForMail(inviteeEmail));
    expect(link).toBe(created.body.acceptUrl);
    const token = link.split('/invite/')[1]!;

    const guest = new Browser();
    expect((await guest.call('GET', `/invites/${token}`)).body.invite.email).toBe(inviteeEmail);

    const accepted = await guest.call('POST', `/invites/${token}/accept`, {
      name: 'Invited Person',
      password: PASSWORD,
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.user.role).toBe('student');
    expect((await guest.call('GET', '/me')).status).toBe(200);

    // the invite is spent, and a student cannot manage users
    expect((await guest.call('GET', `/invites/${token}`)).status).toBe(409);
    expect((await guest.call('GET', '/admin/users')).status).toBe(403);
    expect(
      (await admin.browser.call('GET', '/admin/users')).body.users.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
