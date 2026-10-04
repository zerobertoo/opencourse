import type { Services } from '../types';
import { createMockAuthService } from './auth';
import { createMockCertificateService } from './certificates';
import { createMockContext, type MockContext, type MockOptions } from './context';
import { createMockCourseService } from './courses';
import { createMockCurriculumService } from './curriculum';
import { createMockEnrollmentService } from './enrollments';
import { createMockGrantService } from './grants';
import { createMockNoteService } from './notes';
import { createMockProgressService } from './progress';
import { createMockSettingsService } from './settings';
import { createMockStudioService } from './studio';
import { createMockUserService } from './users';

export type { MockOptions } from './context';
export { DEMO_USER_IDS } from './seed';

export interface MockServices extends Services {
  /** Development and testing controls; not part of the `Services` contract. */
  mock: Pick<MockContext, 'store'>;
}

/** Creates all mock services on top of a single in-memory database. */
export function createMockServices(options: MockOptions = {}): MockServices {
  const context = createMockContext(options);
  return {
    auth: createMockAuthService(context),
    courses: createMockCourseService(context),
    curriculum: createMockCurriculumService(context),
    enrollments: createMockEnrollmentService(context),
    progress: createMockProgressService(context),
    notes: createMockNoteService(context),
    certificates: createMockCertificateService(context),
    users: createMockUserService(context),
    grants: createMockGrantService(context),
    settings: createMockSettingsService(context),
    studio: createMockStudioService(context),
    mock: { store: context.store },
  };
}
