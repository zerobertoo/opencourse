import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ServicesProvider } from '@/services/ServicesProvider';
import type { Services } from '@/services/types';
import { createTestServices } from '@/test/mock-services';
import { useAuth } from './AuthContext';
import { AuthProvider } from './AuthProvider';

function Probe() {
  const { user, status, signOut } = useAuth();
  return (
    <>
      <span data-testid="who">{status === 'loading' ? 'loading' : (user?.name ?? 'nobody')}</span>
      <button type="button" onClick={() => void signOut()}>
        sign out
      </button>
    </>
  );
}

function renderProbe(services: Services) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>
    </ServicesProvider>,
  );
}

describe('AuthProvider sign out', () => {
  it('shows nobody signed in right after signing out, even when the session check is slow', async () => {
    const { services } = createTestServices();
    await services.auth.signInAs('admin');

    // a real network answers the session check slowly; the mock answers instantly
    const slowAuth = {
      ...services.auth,
      getCurrentUser: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return services.auth.getCurrentUser();
      },
    };
    renderProbe({ ...services, auth: slowAuth });
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Marina Albuquerque'));

    await userEvent.setup().click(screen.getByRole('button', { name: 'sign out' }));

    // the guards depend on this: a stale user here sends /login straight back to the app
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'));
    // and it must stay that way once any follow-up session check resolves
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(screen.getByTestId('who')).toHaveTextContent('nobody');
  });
});
