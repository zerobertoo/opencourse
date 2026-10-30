import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { buildSqlCourse } from '@/services/mock/seed/course-others';
import { renderApp } from '@/test/render';
import { chooseOption } from '@/test/select';

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

    await chooseOption(user, screen.getByRole('combobox', { name: 'Idioma' }), 'English');

    await waitFor(() => expect(heading).toHaveTextContent('Modern JavaScript Fundamentals'));
    // the heading node captured before the switch is still the one on screen (no remount)
    expect(heading.isConnected).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible();
    expect(screen.queryByText(/has not been translated yet/)).not.toBeInTheDocument();
  });

  it('falls back to the course default language and says so when a translation is missing', async () => {
    // the demo SQL course is Portuguese only on purpose, to show the fallback
    const sqlCourse = buildSqlCourse('2026-01-01T00:00:00.000Z');
    expect(sqlCourse.translations.map((translation) => translation.locale)).toEqual(['pt-BR']);

    const user = userEvent.setup();
    await renderApp('/courses/analise-de-dados-com-sql', { signInAs: 'student' });

    const originalTitle = sqlCourse.translations[0]!.title;
    await screen.findByRole('heading', { level: 1, name: originalTitle });
    expect(screen.queryByText(/ainda não foi traduzido/)).not.toBeInTheDocument();

    await chooseOption(user, screen.getByRole('combobox', { name: 'Idioma' }), 'English');

    // interface switches, content stays in the default language (queried again after the switch)
    expect(await screen.findByText(/has not been translated yet and is shown in/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: originalTitle })).toBeVisible();
  });
});
