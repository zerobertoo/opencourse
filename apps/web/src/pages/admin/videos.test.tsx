import type { FailedVideo, LocalVideoAsset } from '@opencourse/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { ServiceError } from '@/services/errors';
import { renderApp } from '@/test/render';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const failed: FailedVideo = {
  assetId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
  lessonId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a12',
  lessonTitle: 'Teoria das cores',
  courseId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a13',
  courseTitle: 'Fundamentos de design',
  errorMessage: 'The file has no playable video stream',
  failedAt: '2026-10-13T10:00:00.000Z',
  sizeBytes: 1000,
};

const processing: LocalVideoAsset = {
  provider: 'local',
  assetId: failed.assetId,
  status: 'processing',
  errorMessage: null,
  durationSeconds: null,
};

describe('admin videos', () => {
  it('is reachable from the admin navigation and starts empty', async () => {
    const user = userEvent.setup();
    await renderApp('/admin', { signInAs: 'admin' });

    const sections = await screen.findByRole('navigation', { name: 'Seções da administração' });
    await user.click(within(sections).getByRole('link', { name: 'Vídeos' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Vídeos com falha' }),
    ).toBeVisible();
    expect(await screen.findByText('Nenhum vídeo com falha')).toBeVisible();
  });

  it('lists the failures and sends one back to the encoder', async () => {
    const user = userEvent.setup();
    let pending = [failed];
    const retry = vi.fn(async () => {
      pending = [];
      return processing;
    });
    await renderApp('/admin/videos', {
      signInAs: 'admin',
      override: (services) => ({
        video: { ...services.video, listFailed: async () => pending, retry },
      }),
    });

    const list = within(await screen.findByRole('list', { name: 'Vídeos com falha' }));
    expect(list.getByText('Fundamentos de design')).toBeVisible();
    expect(list.getByText('Teoria das cores')).toBeVisible();
    expect(list.getByText('The file has no playable video stream')).toBeVisible();
    expect(list.getByRole('link', { name: 'Teoria das cores' })).toHaveAttribute(
      'href',
      `/studio/courses/${failed.courseId}`,
    );

    await user.click(list.getByRole('button', { name: 'Tentar de novo: Teoria das cores' }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith(failed.assetId));
    expect(await screen.findByText('Nenhum vídeo com falha')).toBeVisible();
  });

  it('tells the admin when the retry is refused', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/videos', {
      signInAs: 'admin',
      override: (services) => ({
        video: {
          ...services.video,
          listFailed: async () => [failed],
          retry: async () => {
            throw new ServiceError('conflict', 'The original file is no longer stored');
          },
        },
      }),
    });

    await user.click(
      await screen.findByRole('button', { name: 'Tentar de novo: Teoria das cores' }),
    );
    // the failure stays listed
    expect(await screen.findByText('Teoria das cores')).toBeVisible();
    expect(
      await screen.findByText('Essa ação conflita com o estado atual dos dados.'),
    ).toBeVisible();
  });
});
