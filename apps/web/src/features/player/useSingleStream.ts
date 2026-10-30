import { STREAM_BEAT_INTERVAL_SECONDS } from '@opencourse/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/services/ServicesContext';

/**
 * An account plays one uploaded video at a time, and the newest `play` wins. This keeps the
 * platform told that this device is playing, and turns the answer "someone else took over" into
 * `blocked`, pausing the video. Without an `assetId` (embeds, plain video files) it does nothing.
 */
export function useSingleStream(assetId: string | undefined) {
  const { video } = useServices();
  const [blocked, setBlocked] = useState(false);
  /** Changes when the player must start over, such as after taking the stream back. */
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const playingRef = useRef(false);
  /** The `play` report in flight: the player asks for the key at the same moment it is sent. */
  const playReportRef = useRef<Promise<boolean> | undefined>(undefined);
  // a key refused just before our own `play` was recorded is fixed by one more try
  const retriedRef = useRef(false);

  const stopBeats = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  /** Stops beating and frees the stream, so another device does not wait for the timeout. */
  const release = useCallback(() => {
    stopBeats();
    if (!assetId || !playingRef.current) return;
    playingRef.current = false;
    void video.reportPlayback(assetId, 'stop');
  }, [assetId, video, stopBeats]);
  useEffect(() => release, [release]);

  // closing the tab never unmounts the component: the report has to outlive the page
  useEffect(() => {
    if (!assetId) return;
    const onPageHide = () => {
      if (!playingRef.current) return;
      playingRef.current = false;
      void video.reportPlayback(assetId, 'stop', { keepalive: true });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [assetId, video]);

  const onPlay = useCallback(
    (element: HTMLVideoElement) => {
      if (!assetId) return;
      mediaRef.current = element;
      playingRef.current = true;
      retriedRef.current = false;
      setBlocked(false);
      playReportRef.current = video.reportPlayback(assetId, 'play');
      stopBeats();
      timerRef.current = setInterval(() => {
        void video.reportPlayback(assetId, 'beat').then((active) => {
          if (active) return;
          playingRef.current = false;
          mediaRef.current?.pause();
          stopBeats();
          setBlocked(true);
        });
      }, STREAM_BEAT_INTERVAL_SECONDS * 1000);
    },
    [assetId, video, stopBeats],
  );

  /** A playback error is either someone else's stream (the key was refused) or an ordinary failure. */
  const onError = useCallback(async () => {
    if (!assetId) return;
    // our own `play` may still be on its way: it decides who holds the stream
    await playReportRef.current;
    const active = await video.reportPlayback(assetId, 'check');
    if (!active) {
      playingRef.current = false;
      stopBeats();
      setBlocked(true);
    } else if (!retriedRef.current) {
      retriedRef.current = true;
      setAttempt((count) => count + 1);
    }
  }, [assetId, video, stopBeats]);

  /** "Watch here": takes the stream and starts the player over so it fetches the key again. */
  const takeOver = useCallback(async () => {
    if (!assetId) return;
    await video.reportPlayback(assetId, 'play');
    retriedRef.current = false;
    setBlocked(false);
    setAttempt((count) => count + 1);
  }, [assetId, video]);

  return { blocked, attempt, onPlay, onStop: release, onError, takeOver };
}
