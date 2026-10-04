import type { Certificate, CourseDetail } from '@opencourse/shared';

export interface CertificateDetails extends Certificate {
  holderName: string;
  course: CourseDetail;
}

export interface CertificateService {
  listMine(): Promise<CertificateDetails[]>;
  /** Verificação pública: não exige autenticação. Retorna nulo para código desconhecido. */
  verify(code: string): Promise<CertificateDetails | null>;
}
