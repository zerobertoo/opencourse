import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';
import { demoId } from '@/services/mock/seed/ids';

describe('mock user service', () => {
  it('is not available to anonymous visitors or students', async () => {
    await expect(createTestServices().services.users.list()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const student = (await createServicesSignedInAs('lucas')).services;
    await expect(student.users.list()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('lists, searches by name or email and filters by role and status', async () => {
    const { services } = await createServicesSignedInAs('marina');
    expect(await services.users.list()).toHaveLength(14);
    expect((await services.users.list({ search: 'FERREIRA' })).map((u) => u.name)).toEqual([
      'Lucas Ferreira',
    ]);
    expect((await services.users.list({ search: 'camila@' })).map((u) => u.name)).toEqual([
      'Camila Duarte',
    ]);
    expect((await services.users.list({ role: 'instructor' })).map((u) => u.name).sort()).toEqual([
      'Beatriz Nogueira',
      'Rafael Teixeira',
    ]);
    expect((await services.users.list({ active: false })).map((u) => u.name)).toEqual([
      'Diego Rocha',
    ]);
  });

  it('gets a user by id', async () => {
    const { services } = await createServicesSignedInAs('marina');
    expect((await services.users.getById(demoId('user-daniel'))).locale).toBe('en');
    await expect(services.users.getById('ninguem')).rejects.toMatchObject({ code: 'not_found' });
  });

  describe('updateProfile', () => {
    it('updates the signed in user only', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      const updated = await services.users.updateProfile({
        name: '  Lucas F. ',
        locale: 'en',
        timeZone: 'Europe/Lisbon',
      });
      expect(updated).toMatchObject({
        id: demoId('user-lucas'),
        name: 'Lucas F.',
        locale: 'en',
        timeZone: 'Europe/Lisbon',
      });
      expect((await services.auth.getCurrentUser())?.name).toBe('Lucas F.');
    });

    it('rejects an empty name', async () => {
      const { services } = await createServicesSignedInAs('lucas');
      await expect(services.users.updateProfile({ name: ' ' })).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });

  describe('admin actions', () => {
    it('changes roles and deactivates users', async () => {
      const { services } = await createServicesSignedInAs('marina');
      expect((await services.users.updateRole(demoId('user-camila'), 'instructor')).role).toBe(
        'instructor',
      );
      expect((await services.users.setActive(demoId('user-camila'), false)).active).toBe(false);
      expect((await services.users.setActive(demoId('user-diego'), true)).active).toBe(true);
    });

    it('prevents a deactivated user from signing in, and restores access when reactivated', async () => {
      const admin = await createServicesSignedInAs('marina');
      await admin.services.users.setActive(demoId('user-camila'), false);

      const blocked = createTestServices({ storage: admin.storage }).services;
      await blocked.auth.signOut();
      await expect(blocked.auth.signIn('camila@opencourse.example', 'x')).rejects.toMatchObject({
        code: 'forbidden',
      });

      // the session is shared through the storage: the signOut above ended the admin session
      await admin.services.auth.signInAs('admin');
      await admin.services.users.setActive(demoId('user-camila'), true);
      const restored = createTestServices({ storage: admin.storage }).services;
      await expect(restored.auth.signIn('camila@opencourse.example', 'x')).resolves.toBeDefined();
    });

    it('ends the session of a user deactivated while signed in', async () => {
      const { services } = await createServicesSignedInAs('camila');
      expect((await services.auth.getCurrentUser())?.name).toBe('Camila Duarte');

      services.mock.store.db.users.find((user) => user.id === demoId('user-camila'))!.active = false;
      expect(await services.auth.getCurrentUser()).toBeNull();
      await expect(services.enrollments.listMyCourses()).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    it('keeps at least one active admin', async () => {
      const { services } = await createServicesSignedInAs('marina');
      await expect(services.users.updateRole(demoId('user-marina'), 'student')).rejects.toMatchObject({
        code: 'conflict',
      });
      await expect(services.users.setActive(demoId('user-marina'), false)).rejects.toMatchObject({
        code: 'conflict',
      });

      await services.users.updateRole(demoId('user-lucas'), 'admin');
      await expect(services.users.updateRole(demoId('user-marina'), 'instructor')).resolves.toMatchObject({
        role: 'instructor',
      });
    });

    it('is restricted to admins', async () => {
      const instructor = (await createServicesSignedInAs('rafael')).services;
      await expect(instructor.users.updateRole(demoId('user-camila'), 'admin')).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(instructor.users.setActive(demoId('user-camila'), false)).rejects.toMatchObject({
        code: 'forbidden',
      });
    });
  });
});

describe('mock settings service', () => {
  it('returns the instance settings without requiring a session', async () => {
    const { services } = createTestServices();
    const settings = await services.settings.get();
    expect(settings).toMatchObject({
      brand: { name: 'OpenCourse', primaryColor: '#2f6f5e' },
      enabledLocales: ['pt-BR', 'en'],
      defaultLocale: 'pt-BR',
    });
  });

  it('merges partial updates from an admin and persists them', async () => {
    const admin = await createServicesSignedInAs('marina');
    const updated = await admin.services.settings.update({
      brand: { name: 'Escola Aberta', logoUrl: null, primaryColor: '#123456' },
      email: {
        host: 'smtp.exemplo.dev',
        port: 587,
        username: 'robo',
        fromAddress: 'oi@exemplo.dev',
        secure: true,
      },
    });
    expect(updated.brand.name).toBe('Escola Aberta');
    expect(updated.email.port).toBe(587);
    expect(updated.enabledLocales).toEqual(['pt-BR', 'en']);

    const other = createTestServices({ storage: admin.storage }).services;
    expect((await other.settings.get()).brand.primaryColor).toBe('#123456');
  });

  it('changes enabled languages while keeping the default enabled', async () => {
    const { services } = await createServicesSignedInAs('marina');
    const updated = await services.settings.update({ enabledLocales: ['pt-BR'] });
    expect(updated.enabledLocales).toEqual(['pt-BR']);
    await expect(
      services.settings.update({ enabledLocales: ['en'], defaultLocale: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('validates the data', async () => {
    const { services } = await createServicesSignedInAs('marina');
    await expect(
      services.settings.update({ brand: { name: 'X', logoUrl: null, primaryColor: 'verde' } }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(services.settings.update({ enabledLocales: [] })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('only admins can change settings', async () => {
    const instructor = (await createServicesSignedInAs('rafael')).services;
    await expect(instructor.settings.update({ defaultLocale: 'en' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(createTestServices().services.settings.update({})).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
