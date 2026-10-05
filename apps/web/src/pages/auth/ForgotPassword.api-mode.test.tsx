import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

// the page decides from this flag, which is fixed at import time in the real app
vi.mock('@/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services')>()),
  isApiMode: true,
}));

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('forgot password (real API)', () => {
  it('does not offer the demo link: the e-mail is real and the demo token would be rejected', async () => {
    await renderApp('/forgot-password');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('maria@example.com');
    expect(screen.queryByRole('link', { name: /demo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in|sign in/i })).toBeInTheDocument();
  });
});
