import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('forgot password (demo mode)', () => {
  it('offers the demo link, since the mock has no mailbox', async () => {
    await renderApp('/forgot-password');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByRole('link', { name: /demo/i })).toHaveAttribute(
      'href',
      '/reset-password?token=demo-token',
    );
  });
});
