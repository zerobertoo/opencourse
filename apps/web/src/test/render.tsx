import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { AppProviders } from '@/AppProviders';
import { createQueryClient } from '@/lib/queryClient';
import type { MockOptions } from '@/services/mock';
import type { Services } from '@/services';
import { createTestServices } from './mock-services';

interface RenderAppOptions {
  /** Demo role to sign in as before rendering; omit to start signed out. */
  signInAs?: 'student' | 'instructor' | 'admin';
  /** Signs in with this e-mail instead; unknown e-mails become a new student with no grants. */
  email?: string;
  mock?: MockOptions;
  /** Replaces some services after sign in, to stand in for what only the real API does. */
  override?: (services: Services) => Partial<Services>;
}

/** Renders the whole app at a route with fresh mock services and query cache. */
export async function renderApp(
  path: string,
  { signInAs, email, mock, override }: RenderAppOptions = {},
) {
  const { services } = createTestServices(mock);
  if (signInAs) await services.auth.signInAs(signInAs);
  if (email) await services.auth.signIn(email, 'qualquer-senha');

  const result = render(
    <AppProviders
      services={{ ...services, ...override?.(services) }}
      queryClient={createQueryClient()}
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  );
  return { ...result, services };
}
