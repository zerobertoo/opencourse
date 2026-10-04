import type { Certificate } from '@opencourse/shared';
import type { CertificateDetails, CertificateService } from '../certificates';
import type { MockContext } from './context';
import { findCourseById, findUserById } from './helpers';
import { clone } from './store';

export function createMockCertificateService(context: MockContext): CertificateService {
  const { store } = context;

  function toDetails(certificate: Certificate): CertificateDetails {
    return {
      ...certificate,
      holderName: findUserById(store.db, certificate.userId).name,
      course: findCourseById(store.db, certificate.courseId),
    };
  }

  return {
    listMine: () =>
      context.run('certificates.listMine', () => {
        const user = context.requireUser();
        const mine = store.db.certificates
          .filter((certificate) => certificate.userId === user.id)
          .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
          .map(toDetails);
        return clone(mine);
      }),

    verify: (code) =>
      context.run('certificates.verify', () => {
        const certificate = store.db.certificates.find(
          (candidate) => candidate.code === code.trim().toUpperCase(),
        );
        return certificate ? clone(toDetails(certificate)) : null;
      }),
  };
}
