import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const URL_FIELD = 'Endereço (URL)';

async function addWebhook(
  user: ReturnType<typeof userEvent.setup>,
  url = 'https://crm.example.com/hook',
) {
  await user.click(await screen.findByRole('button', { name: 'Adicionar webhook' }));
  const dialog = await screen.findByRole('dialog', { name: 'Adicionar webhook' });
  await user.type(within(dialog).getByLabelText(URL_FIELD), url);
  await user.click(within(dialog).getByLabelText(/Usuário criado/));
  await user.click(within(dialog).getByLabelText(/Acesso revogado/));
  await user.click(within(dialog).getByRole('button', { name: 'Adicionar webhook' }));
  return screen.findByRole('dialog', { name: 'Segredo de assinatura' });
}

describe('admin webhooks', () => {
  it('is reachable from the admin navigation and starts empty', async () => {
    const user = userEvent.setup();
    await renderApp('/admin', { signInAs: 'admin' });

    const sections = await screen.findByRole('navigation', { name: 'Seções da administração' });
    await user.click(within(sections).getByRole('link', { name: 'Webhooks' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Webhooks' })).toBeVisible();
    expect(await screen.findByText('Nenhum webhook ainda')).toBeVisible();
  });

  it('validates the form', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/webhooks', { signInAs: 'admin' });

    await user.click(await screen.findByRole('button', { name: 'Adicionar webhook' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar webhook' });
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar webhook' }));

    expect(await within(dialog).findByText(/Informe um link válido/)).toBeVisible();
    expect(within(dialog).getByText('Escolha pelo menos um evento.')).toBeVisible();
  });

  it('adds a webhook and shows its secret only once', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/webhooks', { signInAs: 'admin' });

    const secretDialog = await addWebhook(user);
    const secret = (within(secretDialog).getByLabelText('Segredo') as HTMLInputElement).value;
    expect(secret).toMatch(/^whsec_/);
    await user.click(within(secretDialog).getByRole('button', { name: 'Já guardei' }));

    const row = within(await screen.findByRole('list', { name: 'Endereços de webhook' }));
    expect(row.getByText('https://crm.example.com/hook')).toBeVisible();
    expect(row.getByText('Ativo')).toBeVisible();
    expect(row.getByText('Usuário criado')).toBeVisible();
    expect(row.getByText('Acesso revogado')).toBeVisible();
    // the list never carries the secret
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(await services.webhooks.list()).toHaveLength(1);
  });

  it('disables a webhook and deletes it after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/webhooks', { signInAs: 'admin' });
    await user.click(within(await addWebhook(user)).getByRole('button', { name: 'Já guardei' }));

    await user.click(
      await screen.findByRole('button', { name: 'Desativar https://crm.example.com/hook' }),
    );
    await waitFor(async () => expect((await services.webhooks.list())[0]?.active).toBe(false));
    expect(await screen.findByText('Desativado')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Excluir https://crm.example.com/hook' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir este webhook?' });
    await user.click(within(confirm).getByRole('button', { name: 'Excluir' }));
    await waitFor(async () => expect(await services.webhooks.list()).toHaveLength(0));
    expect(await screen.findByText('Nenhum webhook ainda')).toBeVisible();
  });

  it('replaces the secret after confirmation and shows the new one', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/webhooks', { signInAs: 'admin' });
    const first = await addWebhook(user);
    const oldSecret = (within(first).getByLabelText('Segredo') as HTMLInputElement).value;
    await user.click(within(first).getByRole('button', { name: 'Já guardei' }));

    await user.click(
      await screen.findByRole('button', {
        name: 'Criar um novo segredo para https://crm.example.com/hook',
      }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Criar um novo segredo?' });
    await user.click(within(confirm).getByRole('button', { name: 'Criar novo segredo' }));

    const second = await screen.findByRole('dialog', { name: 'Segredo de assinatura' });
    expect((within(second).getByLabelText('Segredo') as HTMLInputElement).value).not.toBe(
      oldSecret,
    );
  });

  it('shows the delivery history and retries a failed delivery', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/admin/webhooks', { signInAs: 'admin' });
    await user.click(within(await addWebhook(user)).getByRole('button', { name: 'Já guardei' }));
    const [webhook] = await services.webhooks.list();

    services.mock.store.mutate((db) => {
      db.webhookDeliveries.push({
        id: '11111111-1111-4111-8111-111111111111',
        endpointId: webhook!.id,
        eventId: webhook!.id,
        eventName: 'user.created',
        status: 'failed',
        attempts: 5,
        lastStatusCode: 500,
        lastError: 'Receiver answered 500',
        createdAt: '2026-06-15T12:00:00.000Z',
        lastAttemptAt: '2026-06-15T12:05:00.000Z',
        deliveredAt: null,
      });
    });

    await user.click(
      await screen.findByRole('button', {
        name: 'Histórico de entregas de https://crm.example.com/hook',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Histórico de entregas' });
    const item = within(await within(dialog).findByRole('list', { name: 'Entregas' }));
    expect(item.getByText('Falhou')).toBeVisible();
    expect(item.getByText(/5 tentativas · HTTP 500 · Receiver answered 500/)).toBeVisible();

    await user.click(item.getByRole('button', { name: 'Tentar de novo Usuário criado' }));
    await waitFor(async () =>
      expect((await services.webhooks.listDeliveries(webhook!.id))[0]?.status).toBe('pending'),
    );
  });
});
