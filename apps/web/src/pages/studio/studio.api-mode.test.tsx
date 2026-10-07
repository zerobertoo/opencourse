import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';
import { demoId } from '@/services/mock/seed/ids';

// the panels decide from this flag, which is fixed at import time in the real app
vi.mock('@/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services')>()),
  isApiMode: true,
}));

const SQL_EDITOR = `/studio/courses/${demoId('course-sql')}`;

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('lesson panel against the real API', () => {
  it('offers a file upload and a provider link for video, but no caption upload', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: /^\S+:\s*Seu primeiro SELECT/ }));
    expect(await screen.findByLabelText('Upload video', { selector: 'input' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Paste a link' }));
    expect(await screen.findByLabelText('External video link')).toBeInTheDocument();
    expect(screen.getByText(/Supported providers: .*YouTube/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Upload .* captions/, { selector: 'input' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/uploads arrive in a later release/i).length).toBeGreaterThan(0);
  });

  it('hides the file picker of the materials and explains that files come later', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: /^\S+:\s*Seu primeiro SELECT/ }));
    const materials = (await screen.findByRole('heading', { name: 'Materials' })).closest(
      'section',
    )!;
    expect(within(materials).queryByLabelText('Add files', { selector: 'input' })).toBeNull();
    expect(within(materials).getByText(/uploads arrive in a later release/i)).toBeInTheDocument();
  });

  it('asks for https links in the video form', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: /^\S+:\s*Seu primeiro SELECT/ }));
    await user.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await user.type(await screen.findByLabelText('External video link'), 'http://videos.example/a');
    await user.click(screen.getByRole('button', { name: 'Use link' }));
    expect(await screen.findByText('Enter a valid link starting with https://.')).toBeVisible();
  });

  it('refuses a link that no video provider plugin recognises', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: /^\S+:\s*Seu primeiro SELECT/ }));
    await user.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await user.type(
      await screen.findByLabelText('External video link'),
      'https://videos.example/a',
    );
    await user.click(screen.getByRole('button', { name: 'Use link' }));
    expect(
      await screen.findByText('This link is not from a supported video provider.'),
    ).toBeVisible();
  });
});
