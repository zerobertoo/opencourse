import { createMockServices } from './mock';
import type { Services } from './types';

/**
 * The single place that decides which services implementation the app uses.
 * To swap the mock for a real API, return another `Services` implementation here.
 */
export const services: Services = createMockServices();

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
