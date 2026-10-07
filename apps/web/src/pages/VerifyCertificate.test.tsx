import { screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

const ISSUED_AT = '2026-10-07T02:03:00.000Z';
const originalTimeZone = process.env.TZ;

describe('certificate issue date', () => {
  beforeAll(async () => {
    // 02:03 UTC is still the 6th in Tahiti: a viewer-dependent format would show the wrong day
    process.env.TZ = 'Pacific/Tahiti';
    await i18n.changeLanguage('pt-BR');
  });
  afterAll(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('shows the same UTC day on the public page whatever the viewer time zone is', async () => {
    await renderApp('/verify/OC-ABCD-EFGH', {
      override: () => ({
        certificates: {
          listMine: async () => [],
          verify: async () => ({
            code: 'OC-ABCD-EFGH',
            issuedAt: ISSUED_AT,
            holderName: 'Sam Student',
            courseTitles: { 'pt-BR': 'Projeto' },
            defaultLocale: 'pt-BR',
            template: { signatoryName: '', signatoryRole: '', message: '' },
          }),
        },
      }),
    });
    expect(await screen.findByText(/Emitido em 7 de outubro de 2026/)).toBeVisible();
  });
});
