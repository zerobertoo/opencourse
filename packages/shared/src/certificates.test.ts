import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_CODE_ALPHABET,
  certificateCodeSchema,
  pickCertificateTitle,
  publicCertificateSchema,
} from './index';

describe('certificate contract', () => {
  it('accepts only OC-XXXX-XXXX codes from the unambiguous alphabet', () => {
    expect(certificateCodeSchema.safeParse('OC-AB23-XYZ9').success).toBe(true);
    for (const bad of [
      'OC-AB23-XYZ',
      'oc-ab23-xyz9',
      'OC-0B23-XYZ9',
      'OC-AB2I-XYZ9',
      'AB23-XYZ9',
    ]) {
      expect(certificateCodeSchema.safeParse(bad).success).toBe(false);
    }
    expect(CERTIFICATE_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('picks the title by locale, then course default locale, then any', () => {
    const certificate = { courseTitles: { en: 'Design', 'pt-BR': 'Projeto' }, defaultLocale: 'en' };
    expect(pickCertificateTitle(certificate, 'pt-BR')).toBe('Projeto');
    expect(pickCertificateTitle({ ...certificate, courseTitles: { en: 'Design' } }, 'pt-BR')).toBe(
      'Design',
    );
    expect(
      pickCertificateTitle({ courseTitles: { en: 'Design' }, defaultLocale: 'pt-BR' }, 'pt-BR'),
    ).toBe('Design');
  });

  it('strips ids and e-mail from the public shape', () => {
    const parsed = publicCertificateSchema.parse({
      code: 'OC-AB23-XYZ9',
      issuedAt: '2026-10-06T10:00:00.000Z',
      holderName: 'Sam',
      courseTitles: { en: 'Design' },
      defaultLocale: 'en',
      template: { signatoryName: 'Ines', signatoryRole: '', message: '' },
      userId: '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e11',
      email: 'sam@example.com',
    });
    expect(Object.keys(parsed)).not.toContain('userId');
    expect(Object.keys(parsed)).not.toContain('email');
  });
});
