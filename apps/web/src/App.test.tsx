import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from './i18n';
import { renderApp } from './test/render';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('language switching', () => {
  it('renders in pt-BR and switches to English without reloading', async () => {
    const user = userEvent.setup();
    await renderApp('/showcase');

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
    await renderApp('/showcase');

    expect(screen.getByText('1 aula')).toBeInTheDocument();
    expect(screen.getByText('12 aulas')).toBeInTheDocument();
    expect(screen.getByText('1.234.567,89')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en');

    expect(screen.getByText('12 lessons')).toBeInTheDocument();
    expect(screen.getByText('1,234,567.89')).toBeInTheDocument();
  });
});

describe('theme', () => {
  it('defaults to dark when there is no saved preference', async () => {
    await renderApp('/showcase');

    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Alternar para o tema claro' })).toBeInTheDocument();
  });

  it('toggles the dark class and persists the preference', async () => {
    const user = userEvent.setup();
    await renderApp('/showcase');

    await user.click(screen.getByRole('button', { name: 'Alternar para o tema claro' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('opencourse.theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Alternar para o tema escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('opencourse.theme')).toBe('dark');
  });
});

describe('layouts and routes', () => {
  it('renders the student topbar with search, language and theme controls', async () => {
    await renderApp('/', { signInAs: 'student' });
    expect(await screen.findByRole('heading', { level: 1, name: /Olá, Lucas/ })).toBeVisible();
    expect(screen.getAllByRole('search').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('renders the staff layout with a collapsible sidebar', async () => {
    const user = userEvent.setup();
    await renderApp('/studio', { signInAs: 'instructor' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Painel do instrutor' }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Recolher barra lateral' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expandir barra lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows the 404 page for unknown routes', async () => {
    await renderApp('/nao-existe');
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});

describe('route protection', () => {
  it('sends signed-out visitors to the login screen', async () => {
    await renderApp('/certificates');
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
  });

  it('shows the friendly 403 when a student opens the studio or admin areas', async () => {
    await renderApp('/studio', { signInAs: 'student' });
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });

  it('lets only admins into the admin area', async () => {
    await renderApp('/admin', { signInAs: 'instructor' });
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });
});
