import type { AuthService } from './auth';
import type { CertificateService } from './certificates';
import type { CourseService } from './courses';
import type { CurriculumService } from './curriculum';
import type { EnrollmentService } from './enrollments';
import type { GrantService } from './grants';
import type { NoteService } from './notes';
import type { ProgressService } from './progress';
import type { SettingsService } from './settings';
import type { StudioService } from './studio';
import type { UserService } from './users';
import type { VideoService } from './video';
import type { WebhookService } from './webhooks';

/** All application services. Components depend only on these interfaces. */
export interface Services {
  auth: AuthService;
  courses: CourseService;
  curriculum: CurriculumService;
  enrollments: EnrollmentService;
  progress: ProgressService;
  notes: NoteService;
  certificates: CertificateService;
  users: UserService;
  grants: GrantService;
  settings: SettingsService;
  studio: StudioService;
  video: VideoService;
  webhooks: WebhookService;
}
