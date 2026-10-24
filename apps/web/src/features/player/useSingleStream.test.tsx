import { STREAM_BEAT_INTERVAL_SECONDS } from '@opencourse/shared';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Services } from '@/services';
import { ServicesProvider } from '@/services/ServicesProvider';
import { createTestServices } from '@/test/mock-services';
import { useSingleStream } from './useSingleStream';

const ASSET_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const BEAT_MS = STREAM_BEAT_INTERVAL_SECONDS * 1000;

function setup(assetId: string | null = ASSET_ID) {
  const reportPlayback = vi.fn<(id: string, event: 'play' | 'beat') => Promise<boolean>>(() =>
    Promise.resolve(true),
  );
  const { services } = createTestServices();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={{ ...services, video: { ...services.video, reportPlayback } } as Services}>
      {children}
    </ServicesProvider>
  );
  const hook = renderHook(() => useSingleStream(assetId ?? undefined), { wrapper });
  const element = document.createElement('video');
  element.pause = vi.fn();
  return { ...hook, reportPlayback, element };
}

/** Lets the promise chains behind a timer tick settle. */
const flush = () => act(async () => {});

describe('useSingleStream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes the stream on play, keeps beating and stops when paused', async () => {
    const { result, reportPlayback, element } = setup();

    act(() => result.current.onPlay(element));
    expect(reportPlayback).toHaveBeenCalledWith(ASSET_ID, 'play');

    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS * 2);
    });
    expect(reportPlayback.mock.calls.filter(([, event]) => event === 'beat')).toHaveLength(2);
    expect(result.current.blocked).toBe(false);

    act(() => result.current.onStop());
    reportPlayback.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS * 3);
    });
    expect(reportPlayback).not.toHaveBeenCalled();
  });

  it('pauses the video and blocks once another device took the stream', async () => {
    const { result, reportPlayback, element } = setup();
    act(() => result.current.onPlay(element));
    reportPlayback.mockResolvedValue(false);

    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS);
    });
    expect(element.pause).toHaveBeenCalled();
    expect(result.current.blocked).toBe(true);

    // no more beats while blocked
    reportPlayback.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS * 3);
    });
    expect(reportPlayback).not.toHaveBeenCalled();
  });

  it('"watch here" takes the stream back and restarts the player', async () => {
    const { result, reportPlayback, element } = setup();
    act(() => result.current.onPlay(element));
    reportPlayback.mockResolvedValue(false);
    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS);
    });
    const attempt = result.current.attempt;

    reportPlayback.mockResolvedValue(true);
    await act(async () => {
      await result.current.takeOver();
    });
    expect(reportPlayback).toHaveBeenLastCalledWith(ASSET_ID, 'play');
    expect(result.current.blocked).toBe(false);
    expect(result.current.attempt).toBe(attempt + 1);
  });

  it('reads a playback error as someone else\'s stream when a beat says so', async () => {
    const { result, reportPlayback } = setup();
    reportPlayback.mockResolvedValue(false);
    await act(async () => {
      await result.current.onError();
    });
    expect(result.current.blocked).toBe(true);
  });

  it('retries once on an error nobody caused, then leaves the failure to the player', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onError();
    });
    expect(result.current.blocked).toBe(false);
    expect(result.current.attempt).toBe(1);

    await act(async () => {
      await result.current.onError();
    });
    expect(result.current.attempt).toBe(1);
  });

  it('does nothing without an uploaded video', async () => {
    const { result, reportPlayback, element } = setup(null);
    act(() => result.current.onPlay(element));
    await act(async () => {
      vi.advanceTimersByTime(BEAT_MS * 2);
      await result.current.onError();
    });
    await flush();
    expect(reportPlayback).not.toHaveBeenCalled();
    expect(result.current.blocked).toBe(false);
  });
});
