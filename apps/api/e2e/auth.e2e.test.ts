import { beforeAll, describe, expect, inject, it } from 'vitest';
import { Browser, linkIn, PASSWORD, uniqueEmail, waitForMail } from './support';

describe('stack: accounts', () => {
  // the shared first account (see global-setup): the admin on a fresh instance
  const provided = inject('e2eAdmin');
  const admin = { browser: new Browser(), role: provided.role };

  beforeAll(async () => {
    const signedIn = await admin.browser.call('POST', '/auth/login', {
      email: provided.email,
      password: PASSWORD,
    });
    expect(signedIn.status).toBe(200);
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
