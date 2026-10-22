import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

const LINK = 'Open source on GitHub';

afterEach(() => {
  vi.doUnmock('@/services');
  vi.resetModules();
});

describe('repository link', () => {
  it('shows in demo mode, on the auth and student layouts', async () => {
    await i18n.changeLanguage('en');
    const { unmount } = await renderApp('/login');
    expect(await screen.findByRole('link', { name: LINK })).toBeVisible();
    unmount();

    await renderApp('/', { signInAs: 'student' });
    expect(await screen.findByRole('link', { name: LINK })).toBeVisible();
  });

  it('is hidden when the app runs against a real API', async () => {
    await i18n.changeLanguage('en');
    vi.resetModules();
    vi.doMock('@/services', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/services')>()),
      isApiMode: true,
    }));
    const { renderApp: renderApiApp } = await import('@/test/render');

    const { unmount } = await renderApiApp('/login');
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('link', { name: LINK })).not.toBeInTheDocument();
    unmount();

    await renderApiApp('/', { signInAs: 'student' });
    expect(await screen.findByRole('main')).toBeVisible();
    expect(screen.queryByRole('link', { name: LINK })).not.toBeInTheDocument();
  });
});
