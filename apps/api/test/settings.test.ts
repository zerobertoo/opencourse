import { apiErrorSchema, platformSettingsSchema } from '@opencourse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/db/schema';
import { createTestApp, registerClient, resetDatabase, TestClient, type TestApp } from './helpers';

describe('platform settings', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({ SMTP_HOST: 'smtp.env.test', SMTP_PORT: '2525' });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  async function createCast() {
    const admin = await registerClient(ctx.app, 'admin@example.com', 'Ada Admin');
    const student = await registerClient(ctx.app, 'sam@example.com', 'Sam Student');
    return { admin, student };
  }

  it('starts from defaults, with the e-mail server taken from the environment', async () => {
    const { admin } = await createCast();
    const response = await admin.client.get('/api/v1/settings');

    expect(response.statusCode).toBe(200);
    const settings = platformSettingsSchema.parse(response.json());
    expect(settings.brand.name).toBe('OpenCourse');
    expect(settings.enabledLocales).toEqual(['pt-BR', 'en']);
    expect(settings.email).toMatchObject({ host: 'smtp.env.test', port: 2525, secure: false });
  });

  it('merges a partial change, keeps it, and audits it', async () => {
    const { admin } = await createCast();
    const changed = await admin.client.patch('/api/v1/admin/settings', {
      brand: { name: 'Acme Academy' },
      email: { host: 'smtp.acme.test' },
    });

    expect(changed.statusCode).toBe(200);
    expect(changed.json().brand).toEqual({
      name: 'Acme Academy',
      logoUrl: null,
      primaryColor: '#2f6f5e',
    });
    expect(changed.json().email).toMatchObject({ host: 'smtp.acme.test', port: 2525 });

    const reread = await admin.client.get('/api/v1/settings');
    expect(reread.json().brand.name).toBe('Acme Academy');

    const audit = await admin.client.get('/api/v1/admin/audit');
    expect(audit.json().entries[0]).toMatchObject({
      action: 'settings.updated',
      metadata: { fields: ['brand', 'email'] },
    });
  });

  it('saves the default sender, written as "Name <e-mail>", back unchanged', async () => {
    const { admin } = await createCast();
    const sender = 'OpenCourse <no-reply@opencourse.local>';
    const changed = await admin.client.patch('/api/v1/admin/settings', {
      brand: { name: 'Acme Academy' },
      email: { fromAddress: sender },
    });

    expect(changed.statusCode).toBe(200);
    expect(changed.json().email.fromAddress).toBe(sender);
  });

  it('does not serve a logo address that was saved before addresses were validated', async () => {
    const { admin } = await createCast();
    const current = (await admin.client.get('/api/v1/settings')).json();
    await ctx.app.db.insert(settings).values({
      key: 'platform',
      value: { ...current, brand: { ...current.brand, logoUrl: 'javascript:alert(1)' } },
    });

    const reread = await admin.client.get('/api/v1/settings');
    expect(reread.json().brand.logoUrl).toBeNull();
    const renamed = await admin.client.patch('/api/v1/admin/settings', {
      brand: { name: 'Acme Academy' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().brand.logoUrl).toBeNull();
  });

  it('refuses invalid changes without saving anything', async () => {
    const { admin } = await createCast();

    const badColor = await admin.client.patch('/api/v1/admin/settings', {
      brand: { primaryColor: 'verde' },
    });
    expect(badColor.statusCode).toBe(400);

    const orphanDefault = await admin.client.patch('/api/v1/admin/settings', {
      enabledLocales: ['en'],
    });
    expect(orphanDefault.statusCode).toBe(400);
    expect(apiErrorSchema.parse(orphanDefault.json()).error.message).toMatch(/default language/);

    const emptyHost = await admin.client.patch('/api/v1/admin/settings', { email: { host: ' ' } });
    expect(emptyHost.statusCode).toBe(400);

    const scriptLogo = await admin.client.patch('/api/v1/admin/settings', {
      brand: { logoUrl: 'javascript:alert(1)' },
    });
    expect(scriptLogo.statusCode).toBe(400);

    const unknownKey = await admin.client.patch('/api/v1/admin/settings', { foo: 1 });
    expect(unknownKey.statusCode).toBe(400);

    const badSender = await admin.client.patch('/api/v1/admin/settings', {
      email: { fromAddress: 'nope' },
    });
    expect(badSender.statusCode).toBe(400);

    const reread = await admin.client.get('/api/v1/settings');
    expect(reread.json().enabledLocales).toEqual(['pt-BR', 'en']);
  });

  it('lets anyone read branding, but only admins see or change the mail server', async () => {
    const { student } = await createCast();

    const read = await student.client.get('/api/v1/settings');
    expect(read.statusCode).toBe(200);
    expect(read.json().brand.name).toBe('OpenCourse');
    expect(read.json().email).toMatchObject({ host: '', username: '', fromAddress: '' });
    expect(read.body).not.toContain('smtp.env.test');

    const write = await student.client.patch('/api/v1/admin/settings', { brand: { name: 'X' } });
    expect(write.statusCode).toBe(403);
    // signed-out visitors get the branding too, never the mail server
    const anonymous = await new TestClient(ctx.app).get('/api/v1/settings');
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.body).not.toContain('smtp.env.test');
  });
});
