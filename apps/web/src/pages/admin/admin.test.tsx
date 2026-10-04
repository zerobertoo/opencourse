import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

/** The rows of the visible list with the given accessible name. */
const listItems = async (name: string) =>
  within(await screen.findByRole('list', { name })).getAllByRole('listitem');

describe('admin access', () => {
  it.each(['student', 'instructor'] as const)('blocks the %s role', async (role) => {
    await renderApp('/admin/users', { signInAs: role });
    expect(await screen.findByText('Acesso negado')).toBeVisible();
  });

  it('redirects /admin to the users section and lets the admin switch sections', async () => {
    const user = userEvent.setup();
    await renderApp('/admin', { signInAs: 'admin' });

    expect(await screen.findByRole('heading', { level: 2, name: 'Usuários' })).toBeVisible();
    const sections = screen.getByRole('navigation', { name: 'Seções da administração' });
    await user.click(within(sections).getByRole('link', { name: 'Acessos' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Acesso aos cursos' }),
    ).toBeVisible();
    await user.click(within(sections).getByRole('link', { name: 'Configurações' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Configurações' })).toBeVisible();
  });
});

describe('admin users', () => {
  it('lists users and filters by search, role and status', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/users', { signInAs: 'admin' });

    expect((await listItems('Usuários')).length).toBe(14);

    await user.type(screen.getByLabelText('Buscar usuários'), 'daniel');
    await waitFor(async () => expect(await listItems('Usuários')).toHaveLength(1));
    expect(screen.getByText('Daniel Whitaker')).toBeVisible();

    await user.clear(screen.getByLabelText('Buscar usuários'));
    await user.selectOptions(screen.getByLabelText('Filtrar por papel'), 'instructor');
    await waitFor(async () => expect(await listItems('Usuários')).toHaveLength(2));

    await user.selectOptions(screen.getByLabelText('Filtrar por papel'), '');
    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'inactive');
    await waitFor(async () => expect(await listItems('Usuários')).toHaveLength(1));
    expect(screen.getByText('Diego Rocha')).toBeVisible();
  });

  it('shows an empty state with a way to clear the filters', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/users?q=zzzz', { signInAs: 'admin' });

    expect(await screen.findByText('Nenhum usuário encontrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect((await listItems('Usuários')).length).toBe(14);
  });

  it('shows an error state with retry', async () => {
    let fail = true;
    await renderApp('/admin/users', {
      signInAs: 'admin',
      mock: { failOn: (operation) => fail && operation === 'users.list' },
    });
    const user = userEvent.setup();
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    fail = false;
    await user.click(retry);
    expect((await listItems('Usuários')).length).toBe(14);
  });

  it('changes the role of a user', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/users', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: 'Editar Lucas Ferreira' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar usuário' });
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'instructor');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await services.users.getById('user-lucas')).role).toBe('instructor');
    const row = (await listItems('Usuários')).find((item) =>
      within(item).queryByText('Lucas Ferreira'),
    )!;
    expect(within(row).getByText('Instrutor')).toBeVisible();
  });

  it('deactivates and reactivates users after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/users', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: 'Desativar Camila Duarte' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Desativar este usuário?' });
    await user.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    await waitFor(async () =>
      expect((await services.users.getById('user-camila')).active).toBe(false),
    );

    await user.click(await screen.findByRole('button', { name: 'Reativar Diego Rocha' }));
    const reactivate = await screen.findByRole('alertdialog', { name: 'Reativar este usuário?' });
    await user.click(within(reactivate).getByRole('button', { name: 'Reativar' }));
    await waitFor(async () =>
      expect((await services.users.getById('user-diego')).active).toBe(true),
    );
  });

  it('does not let the admin edit or deactivate their own account', async () => {
    await renderApp('/admin/users', { signInAs: 'admin' });
    expect(await screen.findByRole('button', { name: 'Editar Marina Albuquerque' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desativar Marina Albuquerque' })).toBeDisabled();
  });

  it('creates an invite and shows its link', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/users', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: 'Convidar usuário' }));
    const dialog = await screen.findByRole('dialog', { name: 'Convidar usuário' });
    await user.click(within(dialog).getByRole('button', { name: 'Criar convite' }));
    expect(await within(dialog).findByText('Informe um e-mail válido.')).toBeVisible();

    await user.type(within(dialog).getByLabelText('E-mail'), 'nova.pessoa@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Criar convite' }));

    const link = (await within(dialog).findByLabelText('Link do convite')) as HTMLInputElement;
    expect(link.value).toMatch(/\/invite\/convite-/);
    const invites = await services.grants.listInvites();
    expect(invites.some((invite) => invite.email === 'nova.pessoa@example.com')).toBe(true);
  });
});

describe('admin grants', () => {
  it('lists grants with user and course names and filters them', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/grants', { signInAs: 'admin' });

    const rows = await listItems('Concessões de acesso');
    expect(rows.length).toBeGreaterThan(10);
    expect(within(rows[0]!).getByText(/@opencourse\.example/)).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'revoked');
    await waitFor(async () => expect(await listItems('Concessões de acesso')).toHaveLength(1));
    expect(screen.getByText('Juliana Prado')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), 'expired');
    await waitFor(async () => {
      const expired = await listItems('Concessões de acesso');
      expect(expired.every((row) => within(row).queryByText('Expirado'))).toBe(true);
    });

    await user.selectOptions(screen.getByLabelText('Filtrar por situação'), '');
    await user.type(screen.getByLabelText('Buscar por aluno'), 'thiago');
    await waitFor(async () => expect(await listItems('Concessões de acesso')).toHaveLength(2));
  });

  it('revokes an active grant after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/grants?q=felipe', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: /^Revogar acesso de Felipe/ }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Revogar acesso?' });
    await user.click(within(confirm).getByRole('button', { name: 'Revogar acesso' }));

    await waitFor(async () => {
      const [grant] = await services.grants.list({ userId: 'user-felipe' });
      expect(grant?.status).toBe('revoked');
    });
  });

  it('extends an expired grant back to active, and offers no actions on revoked ones', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/grants?q=juliana', { signInAs: 'admin' });

    const rows = await listItems('Concessões de acesso');
    expect(rows).toHaveLength(2);
    const revokedRow = rows.find((row) => within(row).queryByText('Revogado'))!;
    expect(within(revokedRow).queryByRole('button')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Alterar validade de Juliana/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Alterar validade do acesso' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(async () => {
      const grants = await services.grants.list({ userId: 'user-juliana' });
      expect(grants.filter((grant) => grant.status === 'active')).toHaveLength(1);
    });
  });

  it('validates that the new expiry date is chosen', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/grants?q=patricia', { signInAs: 'admin' });

    const [button] = await screen.findAllByRole('button', { name: /^Alterar validade de/ });
    await user.click(button!);
    const dialog = await screen.findByRole('dialog', { name: 'Alterar validade do acesso' });
    await user.click(within(dialog).getByLabelText('Até uma data'));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Escolha uma data.')).toBeVisible();
  });
});

describe('admin plugins', () => {
  it('lists the planned extensions as coming soon', async () => {
    await renderApp('/admin/plugins', { signInAs: 'admin' });
    const items = await listItems('Extensões planejadas');
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByText('Em breve')).toBeVisible();
  });
});

describe('admin settings', () => {
  it('saves branding, languages and e-mail settings', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/settings', { signInAs: 'admin' });

    const name = await screen.findByLabelText('Nome da plataforma');
    await user.clear(name);
    await user.type(name, 'Escola Oliva');
    const port = screen.getByLabelText('Porta');
    await user.clear(port);
    await user.type(port, '587');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(async () => {
      const settings = await services.settings.get();
      expect(settings.brand.name).toBe('Escola Oliva');
      expect(settings.email.port).toBe(587);
    });
  });

  it('shows inline validation and does not save invalid values', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/settings', { signInAs: 'admin' });

    const color = await screen.findByLabelText('Cor principal');
    await user.clear(color);
    await user.type(color, 'verde');
    const port = screen.getByLabelText('Porta');
    await user.clear(port);
    await user.type(port, '99999');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    expect(await screen.findByText('Use uma cor como #2f6f5e.')).toBeVisible();
    expect(screen.getByText('Informe uma porta entre 1 e 65535.')).toBeVisible();
    expect((await services.settings.get()).brand.primaryColor).toBe('#2f6f5e');
  });

  it('requires the default language to be enabled', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/settings', { signInAs: 'admin' });

    // pt-BR is the default language in the seed.
    await user.click(await screen.findByRole('checkbox', { name: 'Português (Brasil)' }));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(await screen.findByText('O idioma padrão precisa estar habilitado.')).toBeVisible();

    await user.click(screen.getByRole('checkbox', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(await screen.findByText('Habilite pelo menos um idioma.')).toBeVisible();
  });

  it('applies the saved branding to the logo, page title and theme colors', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/settings', { signInAs: 'admin' });

    const name = await screen.findByLabelText('Nome da plataforma');
    await user.clear(name);
    await user.type(name, 'Escola Oliva');
    const color = screen.getByLabelText('Cor principal');
    await user.clear(color);
    await user.type(color, '#aa3300');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));

    await waitFor(() => expect(document.title).toBe('Escola Oliva'));
    expect(screen.getAllByText('Escola Oliva').length).toBeGreaterThan(0);
    const css = document.getElementById('opencourse-brand')?.textContent ?? '';
    expect(css).toContain(':root{--primary:');
    expect(css).toContain(':root.dark{--primary:');
  });

  it('switches the whole screen to English without reloading', async () => {
    await i18n.changeLanguage('en');
    await renderApp('/admin/settings', { signInAs: 'admin' });
    expect(await screen.findByLabelText('Platform name')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeVisible();
  });
});
