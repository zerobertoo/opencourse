import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import i18n from './i18n';
import { ThemeProvider } from './theme/ThemeProvider';

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('language switching', () => {
  it('renders in pt-BR and switches to English without reloading', async () => {
    const user = userEvent.setup();
    renderAt('/');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Guia de componentes' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('pt-BR');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en');

    expect(screen.getByRole('heading', { level: 1, name: 'Component guide' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('opencourse.language')).toBe('en');
  });

  it('applies ICU plural rules and Intl formatting per language', async () => {
    const user = userEvent.setup();
    renderAt('/');

    expect(screen.getByText('1 aula')).toBeInTheDocument();
    expect(screen.getByText('12 aulas')).toBeInTheDocument();
    expect(screen.getByText('1.234.567,89')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en');

    expect(screen.getByText('12 lessons')).toBeInTheDocument();
    expect(screen.getByText('1,234,567.89')).toBeInTheDocument();
  });
});

describe('theme', () => {
  it('toggles the dark class and persists the preference', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('button', { name: 'Alternar para o tema escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('opencourse.theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Alternar para o tema claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('layouts and routes', () => {
  it('renders the student topbar with search, language and theme controls', () => {
    renderAt('/');
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('renders the staff layout with a collapsible sidebar', async () => {
    const user = userEvent.setup();
    renderAt('/studio');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Painel do instrutor' }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Recolher barra lateral' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expandir barra lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows the 404 page for unknown routes', () => {
    renderAt('/nao-existe');
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});
