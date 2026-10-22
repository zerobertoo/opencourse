import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { ServiceError } from '@/services/errors';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

async function submitCredentials() {
  await userEvent.type(screen.getByLabelText('E-mail'), 'maria@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login errors', () => {
  it('says the credentials are wrong when the API answers 401, not that the session expired', async () => {
    await renderApp('/login', {
      override: ({ auth }) => ({
        auth: {
          ...auth,
          signIn: () => Promise.reject(new ServiceError('unauthorized', 'Invalid credentials')),
        },
      }),
    });
    await submitCredentials();

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect e-mail or password.');
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('keeps the generic message for other failures', async () => {
    await renderApp('/login', {
      override: ({ auth }) => ({
        auth: {
          ...auth,
          signIn: () => Promise.reject(new ServiceError('unavailable', 'down')),
        },
      }),
    });
    await submitCredentials();

    expect(await screen.findByRole('alert')).not.toHaveTextContent('Incorrect e-mail or password.');
  });
});
