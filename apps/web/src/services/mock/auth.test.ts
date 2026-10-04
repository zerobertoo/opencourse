import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createTestServices } from '@/test/mock-services';

describe('mock auth service', () => {
  it('starts without a session', async () => {
    const { services } = createTestServices();
    expect(await services.auth.getCurrentUser()).toBeNull();
  });

  it.each([
    ['student', 'Lucas Ferreira'],
    ['instructor', 'Rafael Teixeira'],
    ['admin', 'Marina Albuquerque'],
  ] as const)('signs in as the demo %s', async (role, name) => {
    const { services } = createTestServices();
    const user = await services.auth.signInAs(role);
    expect(user).toMatchObject({ role, name });
    expect(await services.auth.getCurrentUser()).toEqual(user);
  });

  it('accepts any credentials and signs in an existing user by email', async () => {
    const { services } = createTestServices();
    const user = await services.auth.signIn('  CAMILA@opencourse.example ', 'qualquer-coisa');
    expect(user.name).toBe('Camila Duarte');
  });

  it('creates a student on the fly for an unknown email', async () => {
    const { services } = createTestServices();
    const user = await services.auth.signIn('maria.silva@exemplo.dev', 'x');
    expect(user).toMatchObject({ name: 'Maria Silva', role: 'student', active: true });
    expect((await services.auth.signIn('maria.silva@exemplo.dev', 'x')).id).toBe(user.id);
  });

  it('rejects malformed email and empty password', async () => {
    const { services } = createTestServices();
    await expect(services.auth.signIn('sem-arroba', 'x')).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(services.auth.signIn('a@b.com', '')).rejects.toMatchObject({ code: 'validation' });
  });

  it('blocks deactivated users', async () => {
    const { services } = createTestServices();
    await expect(services.auth.signIn('diego@opencourse.example', 'x')).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await services.auth.getCurrentUser()).toBeNull();
  });

  it('keeps the session across instances and clears it on sign out', async () => {
    const storage = createMemoryStorage();
    const first = createTestServices({ storage }).services;
    await first.auth.signInAs('student');

    const second = createTestServices({ storage }).services;
    expect((await second.auth.getCurrentUser())?.name).toBe('Lucas Ferreira');

    await second.auth.signOut();
    expect(await second.auth.getCurrentUser()).toBeNull();
    expect(await first.auth.getCurrentUser()).toBeNull();
  });

  describe('signUp', () => {
    it('creates a student, signs in and uses the instance default language', async () => {
      const { services } = createTestServices();
      const user = await services.auth.signUp({
        name: ' Ana Paula ',
        email: 'Ana@Exemplo.dev',
        password: 'senha-segura',
      });
      expect(user).toMatchObject({
        name: 'Ana Paula',
        email: 'ana@exemplo.dev',
        role: 'student',
        locale: 'pt-BR',
      });
      expect((await services.auth.getCurrentUser())?.id).toBe(user.id);
    });

    it('validates name, email and password length', async () => {
      const { services } = createTestServices();
      const valid = { name: 'Ana', email: 'ana@exemplo.dev', password: 'senha-segura' };
      await expect(services.auth.signUp({ ...valid, name: ' ' })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(services.auth.signUp({ ...valid, email: 'x' })).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(services.auth.signUp({ ...valid, password: '1234567' })).rejects.toMatchObject({
        code: 'validation',
      });
    });

    it('rejects an email that is already registered', async () => {
      const { services } = createTestServices();
      await expect(
        services.auth.signUp({
          name: 'Outro Lucas',
          email: 'lucas@opencourse.example',
          password: 'senha-segura',
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
    });
  });

  describe('password recovery', () => {
    it('never reveals whether the email exists', async () => {
      const { services } = createTestServices();
      await expect(
        services.auth.requestPasswordReset('lucas@opencourse.example'),
      ).resolves.toBeUndefined();
      await expect(
        services.auth.requestPasswordReset('ninguem@exemplo.dev'),
      ).resolves.toBeUndefined();
      await expect(services.auth.requestPasswordReset('invalido')).rejects.toMatchObject({
        code: 'validation',
      });
    });

    it('requires a token and a strong enough password to reset', async () => {
      const { services } = createTestServices();
      await expect(
        services.auth.resetPassword('token-valido', 'nova-senha-123'),
      ).resolves.toBeUndefined();
      await expect(services.auth.resetPassword('', 'nova-senha-123')).rejects.toMatchObject({
        code: 'validation',
      });
      await expect(services.auth.resetPassword('token-valido', 'curta')).rejects.toMatchObject({
        code: 'validation',
      });
    });
  });

  describe('invites', () => {
    it('shows a pending invite', async () => {
      const { services } = createTestServices();
      const invite = await services.auth.getInvite('demo-convite-sql');
      expect(invite).toMatchObject({
        email: 'novo.aluno@opencourse.example',
        courseId: 'course-sql',
      });
    });

    it('rejects unknown and expired invites', async () => {
      const { services } = createTestServices();
      await expect(services.auth.getInvite('nao-existe')).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(services.auth.getInvite('demo-convite-vencido')).rejects.toMatchObject({
        code: 'conflict',
      });
    });

    it('creates the account, grants the course and consumes the invite', async () => {
      const { services } = createTestServices();
      const user = await services.auth.acceptInvite('demo-convite-sql', {
        name: 'Novo Aluno',
        password: 'senha-segura',
      });
      expect(user).toMatchObject({ email: 'novo.aluno@opencourse.example', role: 'student' });
      expect((await services.auth.getCurrentUser())?.id).toBe(user.id);

      const courses = await services.enrollments.listMyCourses();
      expect(courses.map((entry) => entry.course.id)).toEqual(['course-sql']);
      expect(courses[0]?.grant).toMatchObject({
        source: 'invite',
        expiresAt: null,
        status: 'active',
      });

      await expect(services.auth.getInvite('demo-convite-sql')).rejects.toMatchObject({
        code: 'conflict',
      });
    });

    it('accepts a general invite without granting any course', async () => {
      const { services } = createTestServices();
      await services.auth.acceptInvite('demo-convite-geral', {
        name: 'Convidado',
        password: 'senha-segura',
      });
      expect(await services.enrollments.listMyCourses()).toEqual([]);
    });

    it('validates the form before consuming the invite', async () => {
      const { services } = createTestServices();
      await expect(
        services.auth.acceptInvite('demo-convite-sql', { name: '', password: 'senha-segura' }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.auth.acceptInvite('demo-convite-sql', { name: 'Fulano', password: 'curta' }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(services.auth.getInvite('demo-convite-sql')).resolves.toBeDefined();
    });
  });
});
