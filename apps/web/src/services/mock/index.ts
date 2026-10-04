import type { Services } from '../types';
import { createMockAuthService } from './auth';
import { createMockCertificateService } from './certificates';
import { createMockContext, type MockContext, type MockOptions } from './context';
import { createMockCourseService } from './courses';
import { createMockEnrollmentService } from './enrollments';
import { createMockGrantService } from './grants';
import { createMockProgressService } from './progress';
import { createMockSettingsService } from './settings';
import { createMockUserService } from './users';

export type { MockOptions } from './context';
export { DEMO_USER_IDS } from './seed';

export interface MockServices extends Services {
  /** Controles de desenvolvimento e testes; não fazem parte do contrato `Services`. */
  mock: Pick<MockContext, 'store'>;
}

/** Cria todos os services mockados sobre um mesmo banco em memória. */
export function createMockServices(options: MockOptions = {}): MockServices {
  const context = createMockContext(options);
  return {
    auth: createMockAuthService(context),
    courses: createMockCourseService(context),
    enrollments: createMockEnrollmentService(context),
    progress: createMockProgressService(context),
    certificates: createMockCertificateService(context),
    users: createMockUserService(context),
    grants: createMockGrantService(context),
    settings: createMockSettingsService(context),
    mock: { store: context.store },
  };
}
