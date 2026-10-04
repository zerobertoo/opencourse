import type { AuthService } from './auth';
import type { CertificateService } from './certificates';
import type { CourseService } from './courses';
import type { EnrollmentService } from './enrollments';
import type { GrantService } from './grants';
import type { ProgressService } from './progress';
import type { SettingsService } from './settings';
import type { UserService } from './users';

/** Todos os services da aplicação. Componentes dependem só destas interfaces. */
export interface Services {
  auth: AuthService;
  courses: CourseService;
  enrollments: EnrollmentService;
  progress: ProgressService;
  certificates: CertificateService;
  users: UserService;
  grants: GrantService;
  settings: SettingsService;
}
