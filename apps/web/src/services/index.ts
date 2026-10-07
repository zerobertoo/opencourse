import { localeSchema } from '@opencourse/shared';
import i18n from '@/i18n';
import { ApiClient } from './api/client';
import { createHybridServices } from './hybrid';
import { createMockServices } from './mock';
import type { Services } from './types';

/** Address of the real API. Unset means demo mode: everything runs on the in-browser mock. */
const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined;

/** True when sign-in, users and invites go through the real API. */
export const isApiMode = API_URL !== undefined;

/** Language and time zone sent when creating an account, so it starts with the user's settings. */
function getPreferences() {
  const locale = localeSchema.safeParse(i18n.resolvedLanguage);
  return {
    ...(locale.success ? { locale: locale.data } : {}),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/**
 * The single place that decides which services implementation the app uses.
 * Without `VITE_API_URL` it is the full mock; with it, the real API handles auth, users and
 * invites while the rest stays mocked until its backend milestone.
 */
export const services: Services = API_URL
  ? createHybridServices(
      new ApiClient({ baseUrl: API_URL }),
      createMockServices({ mode: 'api' }),
      getPreferences,
    )
  : createMockServices();

export { ServiceError, isServiceError, type ServiceErrorCode } from './errors';
export type { Services } from './types';
export type * from './auth';
export type * from './certificates';
export type * from './courses';
export type * from './curriculum';
export type * from './enrollments';
export type * from './grants';
export type * from './notes';
export type * from './progress';
export type * from './settings';
export type * from './studio';
export type * from './users';
