import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

async function createKey(user: ReturnType<typeof userEvent.setup>, name = 'Loja de cursos') {
  await user.click(await screen.findByRole('button', { name: 'Criar chave de API' }));
  const dialog = await screen.findByRole('dialog', { name: 'Criar chave de API' });
  await user.type(within(dialog).getByLabelText('Nome'), name);
  await user.click(within(dialog).getByRole('button', { name: 'Criar chave' }));
  return screen.findByRole('dialog', { name: 'Token da chave de API' });
}

describe('admin API keys', () => {
  it('is reachable from the admin navigation and starts empty', async () => {
    const user = userEvent.setup();
    await renderApp('/admin', { signInAs: 'admin' });

    const sections = await screen.findByRole('navigation', { name: 'Seções da administração' });
    await user.click(within(sections).getByRole('link', { name: 'Chaves de API' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Chaves de API' })).toBeVisible();
    expect(await screen.findByText('Nenhuma chave de API ainda')).toBeVisible();
  });

  it('validates the name', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/api-keys', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: 'Criar chave de API' }));
    const dialog = await screen.findByRole('dialog', { name: 'Criar chave de API' });
    await user.click(within(dialog).getByRole('button', { name: 'Criar chave' }));

    expect(await within(dialog).findByText('Preencha este campo.')).toBeVisible();
  });

  it('creates a key and shows its token only once', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/api-keys', { signInAs: 'admin' });

    const tokenDialog = await createKey(user);
    expect(within(tokenDialog).getByRole('note')).toHaveTextContent(/nunca compartilhe/);
    const token = (within(tokenDialog).getByLabelText('Token') as HTMLInputElement).value;
    expect(token).toMatch(/^oc_/);
    await user.click(within(tokenDialog).getByRole('button', { name: 'Já guardei' }));

    const list = within(await screen.findByRole('list', { name: 'Chaves de API' }));
    expect(list.getByText('Loja de cursos')).toBeVisible();
    expect(list.getByText('Ativa')).toBeVisible();
    expect(list.getByText(/Nunca usada/)).toBeVisible();
    expect(list.getByText(`Começa com ${token.slice(0, 10)}…`)).toBeVisible();
    // the list never carries the token
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    expect(JSON.stringify(await services.apiKeys.list())).not.toContain(token);
  });

  it('revokes a key after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/api-keys', { signInAs: 'admin' });
    await user.click(within(await createKey(user)).getByRole('button', { name: 'Já guardei' }));

    await user.click(await screen.findByRole('button', { name: 'Revogar Loja de cursos' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Revogar esta chave de API?' });
    await user.click(within(confirm).getByRole('button', { name: 'Revogar' }));

    await waitFor(async () => expect((await services.apiKeys.list())[0]?.revokedAt).not.toBeNull());
    expect(await screen.findByText('Revogada')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Revogar Loja de cursos' }),
    ).not.toBeInTheDocument();
  });
});
