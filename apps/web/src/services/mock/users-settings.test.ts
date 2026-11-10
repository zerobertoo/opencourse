import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';
import { demoId } from '@/services/mock/seed/ids';

describe('mock user service', () => {
  it('is not available to anonymous visitors or students', async () => {
    await expect(createTestServices().services.users.list()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const student = (await createServicesSignedInAs('donatello')).services;
    await expect(student.users.list()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('lists, searches by name or email and filters by role and status', async () => {
    const { services } = await createServicesSignedInAs('leonardo');
    expect(await services.users.list()).toHaveLength(14);
    expect((await services.users.list({ search: 'BARDI' })).map((u) => u.name)).toEqual([
      'Donatello Bardi',
    ]);
    expect((await services.users.list({ search: 'marie@' })).map((u) => u.name)).toEqual([
      'Marie Curie',
    ]);
    expect((await services.users.list({ role: 'instructor' })).map((u) => u.name).sort()).toEqual([
      'Ada Lovelace',
      'Michelangelo Buonarroti',
    ]);
    expect((await services.users.list({ active: false })).map((u) => u.name)).toEqual([
      'Machado de Assis',
    ]);
  });

  it('gets a user by id', async () => {
    const { services } = await createServicesSignedInAs('leonardo');
    expect((await services.users.getById(demoId('user-albert'))).locale).toBe('en');
    await expect(services.users.getById('ninguem')).rejects.toMatchObject({ code: 'not_found' });
  });

  describe('updateProfile', () => {
    it('updates the signed in user only', async () => {
      const { services } = await createServicesSignedInAs('donatello');
      const updated = await services.users.updateProfile({
        name: '  Donatello F. ',
        locale: 'en',
        timeZone: 'Europe/Lisbon',
      });
      expect(updated).toMatchObject({
        id: demoId('user-donatello'),
        name: 'Donatello F.',
        locale: 'en',
        timeZone: 'Europe/Lisbon',
      });
      expect((await services.auth.getCurrentUser())?.name).toBe('Donatello F.');
    });

    it('rejects an empty name', async () => {
      const { services } = await createServicesSignedInAs('donatello');
      await expect(services.users.updateProfile({ name: ' ' })).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });

  describe('admin actions', () => {
    it('changes roles and deactivates users', async () => {
      const { services } = await createServicesSignedInAs('leonardo');
      expect((await services.users.updateRole(demoId('user-marie'), 'instructor')).role).toBe(
        'instructor',
      );
      expect((await services.users.setActive(demoId('user-marie'), false)).active).toBe(false);
      expect((await services.users.setActive(demoId('user-machado'), true)).active).toBe(true);
    });

    it('prevents a deactivated user from signing in, and restores access when reactivated', async () => {
      const admin = await createServicesSignedInAs('leonardo');
      await admin.services.users.setActive(demoId('user-marie'), false);

      const blocked = createTestServices({ storage: admin.storage }).services;
      await blocked.auth.signOut();
      await expect(blocked.auth.signIn('marie@opencourse.example', 'x')).rejects.toMatchObject({
        code: 'forbidden',
      });

      // the session is shared through the storage: the signOut above ended the admin session
      await admin.services.auth.signInAs('admin');
      await admin.services.users.setActive(demoId('user-marie'), true);
      const restored = createTestServices({ storage: admin.storage }).services;
      await expect(restored.auth.signIn('marie@opencourse.example', 'x')).resolves.toBeDefined();
    });

    it('ends the session of a user deactivated while signed in', async () => {
      const { services } = await createServicesSignedInAs('marie');
      expect((await services.auth.getCurrentUser())?.name).toBe('Marie Curie');

      services.mock.store.db.users.find((user) => user.id === demoId('user-marie'))!.active = false;
      expect(await services.auth.getCurrentUser()).toBeNull();
      await expect(services.enrollments.listMyCourses()).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    it('keeps at least one active admin', async () => {
      const { services } = await createServicesSignedInAs('leonardo');
      await expect(
        services.users.updateRole(demoId('user-leonardo'), 'student'),
      ).rejects.toMatchObject({
        code: 'conflict',
      });
      await expect(services.users.setActive(demoId('user-leonardo'), false)).rejects.toMatchObject({
        code: 'conflict',
      });

      await services.users.updateRole(demoId('user-donatello'), 'admin');
      await expect(
        services.users.updateRole(demoId('user-leonardo'), 'instructor'),
      ).resolves.toMatchObject({
        role: 'instructor',
      });
    });

    it('is restricted to admins', async () => {
      const instructor = (await createServicesSignedInAs('michelangelo')).services;
      await expect(
        instructor.users.updateRole(demoId('user-marie'), 'admin'),
      ).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(instructor.users.setActive(demoId('user-marie'), false)).rejects.toMatchObject({
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
    const admin = await createServicesSignedInAs('leonardo');
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
    const { services } = await createServicesSignedInAs('leonardo');
    const updated = await services.settings.update({ enabledLocales: ['pt-BR'] });
    expect(updated.enabledLocales).toEqual(['pt-BR']);
    await expect(
      services.settings.update({ enabledLocales: ['en'], defaultLocale: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('keeps the video provider list when a patch leaves it out, and refuses unknown providers', async () => {
    const { services } = await createServicesSignedInAs('leonardo');
    const turnedOn = await services.settings.update({
      video: { enabledVideoProviders: ['panda'] },
    });
    expect(turnedOn.video.enabledVideoProviders).toEqual(['panda']);

    const otherChange = await services.settings.update({ video: { watermarkEnabled: true } });
    expect(otherChange.video).toMatchObject({
      watermarkEnabled: true,
      enabledVideoProviders: ['panda'],
    });

    await expect(
      services.settings.update({ video: { enabledVideoProviders: ['nope'] } }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('validates the data', async () => {
    const { services } = await createServicesSignedInAs('leonardo');
    await expect(
      services.settings.update({ brand: { name: 'X', logoUrl: null, primaryColor: 'verde' } }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(services.settings.update({ enabledLocales: [] })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('only admins can change settings', async () => {
    const instructor = (await createServicesSignedInAs('michelangelo')).services;
    await expect(instructor.settings.update({ defaultLocale: 'en' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(createTestServices().services.settings.update({})).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
