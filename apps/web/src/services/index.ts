import { createMockServices } from './mock';
import type { Services } from './types';

/**
 * Único ponto que decide qual implementação dos services a aplicação usa.
 * Para trocar o mock por uma API real, devolva aqui outra implementação de `Services`.
 */
export const services: Services = createMockServices();

export { ServiceError, isServiceError, type ServiceErrorCode } from './errors';
export type { Services } from './types';
export type * from './auth';
export type * from './certificates';
export type * from './courses';
export type * from './enrollments';
export type * from './grants';
export type * from './progress';
export type * from './settings';
export type * from './users';
