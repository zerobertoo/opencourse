import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';
import { demoId } from '@/services/mock/seed/ids';

/**
 * Routes of the student area, plus a course page and a lesson of the seeded course.
 * `/showcase` is left out: it is a design-system page that shows a skeleton on purpose.
 */
const STUDENT_ROUTES = [
  '/',
  '/courses/fundamentos-de-javascript',
  `/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-1')}`,
  '/certificates',
  '/settings',
];

const STUDIO_ROUTES = [
  '/studio',
  '/studio/courses',
  ...['details', 'content', 'students', 'certificate', 'settings'].map(
    (tab) => `/studio/courses/course-sql/${tab}`,
  ),
];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/grants',
  '/admin/webhooks',
  '/admin/settings',
  '/admin/plugins',
];

const ROLES = {
  student: STUDENT_ROUTES,
  instructor: [...STUDENT_ROUTES, ...STUDIO_ROUTES],
  admin: [...STUDENT_ROUTES, ...STUDIO_ROUTES, ...ADMIN_ROUTES],
} as const;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => consoleError.mockRestore());

/** Texts of the error, 403 and 404 screens in every language the app ships. */
const FAILURE_TEXTS = [
  'Algo deu errado',
  'Something went wrong',
  'Acesso negado',
  'Access denied',
  'Página não encontrada',
  'Page not found',
];

describe.each(Object.entries(ROLES))('%s navigation', (role, routes) => {
  it.each(routes)('opens %s without errors', async (route) => {
    await renderApp(route, { signInAs: role as keyof typeof ROLES });

    // The page has a heading and the loading skeleton is gone.
    expect(await screen.findAllByRole('heading')).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryByRole('status', { busy: true })).toBeNull());

    for (const text of FAILURE_TEXTS) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('role boundaries', () => {
  it.each([
    ['student', '/studio'],
    ['student', '/admin/users'],
    ['instructor', '/admin/grants'],
  ] as const)('%s gets the 403 screen on %s', async (role, route) => {
    await renderApp(route, { signInAs: role });
    expect(await screen.findByText('Acesso negado')).toBeVisible();
  });
});
