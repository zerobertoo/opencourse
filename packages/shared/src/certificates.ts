import { z } from 'zod';
import { idSchema, isoDateSchema, type Locale } from './base';
import { certificateSchema, certificateTemplateSchema } from './entities';

/** Characters of a certificate code: no 0/O or 1/I/L, which are easy to misread when typed. */
export const CERTIFICATE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** `OC-XXXX-XXXX`, always upper case. */
export const certificateCodeSchema = z
  .string()
  .regex(new RegExp(`^OC-[${CERTIFICATE_CODE_ALPHABET}]{4}-[${CERTIFICATE_CODE_ALPHABET}]{4}$`));

/** What a certificate says, copied when it is issued so later edits never change it. */
const certificateSnapshotShape = {
  holderName: z.string().min(1),
  /** Course title per locale at issue time. */
  courseTitles: z.record(z.string(), z.string()),
  defaultLocale: z.string().min(1),
  template: certificateTemplateSchema.omit({ enabled: true }),
};

/** A certificate with the data the list, the preview and the PDF need. */
export const certificateDetailsSchema = certificateSchema.extend(certificateSnapshotShape);
export type CertificateDetails = z.infer<typeof certificateDetailsSchema>;

/** What anyone with the code sees: no ids, no e-mail. */
export const publicCertificateSchema = z.object({
  code: z.string().min(1),
  issuedAt: isoDateSchema,
  ...certificateSnapshotShape,
});
export type PublicCertificate = z.infer<typeof publicCertificateSchema>;

export const certificateCodeParamsSchema = z.object({ code: z.string() });

export const listCertificatesResponseSchema = z.object({
  certificates: z.array(certificateDetailsSchema),
});

export const certificateIssuedEventSchema = z.object({
  userId: idSchema,
  courseId: idSchema,
  certificateId: idSchema,
  code: z.string().min(1),
});
export type CertificateIssuedEvent = z.infer<typeof certificateIssuedEventSchema>;

/** Title in the wanted locale, then in the course default locale, then in any locale. */
export function pickCertificateTitle(
  certificate: Pick<PublicCertificate, 'courseTitles' | 'defaultLocale'>,
  locale: Locale,
): string {
  const { courseTitles, defaultLocale } = certificate;
  return (
    courseTitles[locale] ?? courseTitles[defaultLocale] ?? Object.values(courseTitles)[0] ?? ''
  );
}
