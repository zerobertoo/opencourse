import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/AppProviders';
import i18n from '@/i18n';
import { createQueryClient } from '@/lib/queryClient';
import { createTestServices } from '@/test/mock-services';
import { NewModuleDialog } from './StructureDialogs';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('new module dialog', () => {
  it('starts on the required field of the default language, even when it is not listed first', async () => {
    const { services } = createTestServices();
    render(
      <AppProviders services={services} queryClient={createQueryClient()}>
        <MemoryRouter>
          <NewModuleDialog
            open
            onOpenChange={() => undefined}
            defaultLocale="en"
            locales={['pt-BR', 'en']}
            onSubmit={() => Promise.resolve()}
          />
        </MemoryRouter>
      </AppProviders>,
    );

    const english = await screen.findByLabelText('Title in English');
    expect(english).toHaveFocus();
    const fields = screen.getAllByLabelText(/^Title in /);
    expect(fields.map((field) => field.getAttribute('name'))).toEqual([
      'translations.en.title',
      'translations.pt-BR.title',
    ]);
  });
});
