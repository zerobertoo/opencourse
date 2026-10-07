import type { Certificate, PublicCertificate } from '@opencourse/shared';
import type { CertificateDetails, CertificateService } from '../certificates';
import type { MockContext } from './context';
import { findCourseById, findUserById } from './helpers';
import { clone } from './store';

export function createMockCertificateService(context: MockContext): CertificateService {
  const { store } = context;

  /** Same snapshot the API stores: the mock reads the live data at the time of the call. */
  function toDetails(certificate: Certificate): CertificateDetails {
    const course = findCourseById(store.db, certificate.courseId);
    const { signatoryName, signatoryRole, message } = course.certificateTemplate;
    return {
      ...certificate,
      holderName: findUserById(store.db, certificate.userId).name,
      courseTitles: Object.fromEntries(
        course.translations.map((item) => [item.locale, item.title]),
      ),
      defaultLocale: course.defaultLocale,
      template: { signatoryName, signatoryRole, message },
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
      context.run('certificates.verify', (): PublicCertificate | null => {
        const certificate = store.db.certificates.find(
          (candidate) => candidate.code === code.trim().toUpperCase(),
        );
        if (!certificate) return null;
        const details = toDetails(certificate);
        return clone({
          code: details.code,
          issuedAt: details.issuedAt,
          holderName: details.holderName,
          courseTitles: details.courseTitles,
          defaultLocale: details.defaultLocale,
          template: details.template,
        });
      }),
  };
}
