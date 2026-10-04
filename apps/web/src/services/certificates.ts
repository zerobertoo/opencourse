import type { Certificate, CourseDetail } from '@opencourse/shared';

export interface CertificateDetails extends Certificate {
  holderName: string;
  course: CourseDetail;
}

export interface CertificateService {
  listMine(): Promise<CertificateDetails[]>;
  /** Public verification: does not require authentication. Returns null for an unknown code. */
  verify(code: string): Promise<CertificateDetails | null>;
}
