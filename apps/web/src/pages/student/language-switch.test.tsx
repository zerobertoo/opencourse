import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

// PRD v1 acceptance criterion 3: switching the language changes interface and content without
// reloading, with a fallback to the course default language when a translation is missing.

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('language switching on the course page', () => {
  it('translates interface and content in place, without remounting the page', async () => {
    const user = userEvent.setup();
    await renderApp('/courses/fundamentos-de-javascript', { signInAs: 'student' });

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Fundamentos de JavaScript Moderno',
    });
    expect(screen.queryByText(/ainda não foi traduzido/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en');

    await waitFor(() => expect(heading).toHaveTextContent('Modern JavaScript Fundamentals'));
    // the heading node captured before the switch is still the one on screen (no remount)
    expect(heading.isConnected).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible();
    expect(screen.queryByText(/has not been translated yet/)).not.toBeInTheDocument();
  });

  it('falls back to the course default language and says so when a translation is missing', async () => {
    const user = userEvent.setup();
    await renderApp('/courses/analise-de-dados-com-sql', { signInAs: 'student' });

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: /Análise de Dados com SQL/,
    });
    const originalTitle = heading.textContent;
    expect(screen.queryByText(/ainda não foi traduzido/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en');

    // interface switches, content stays in the default language
    expect(await screen.findByText(/has not been translated yet and is shown in/)).toBeVisible();
    expect(heading).toHaveTextContent(originalTitle!);
  });
});
