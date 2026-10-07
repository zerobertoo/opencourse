import type { CertificateDetails, PublicCertificate } from '@opencourse/shared';

export type { CertificateDetails, PublicCertificate };

export interface CertificateService {
  listMine(): Promise<CertificateDetails[]>;
  /** Public verification: does not require authentication. Returns null for an unknown code. */
  verify(code: string): Promise<PublicCertificate | null>;
}
