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
  // a key refused just before our own `play` was recorded is fixed by one more try
  const retriedRef = useRef(false);

  const stopBeats = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);
  useEffect(() => stopBeats, [stopBeats]);

  const onPlay = useCallback(
    (element: HTMLVideoElement) => {
      if (!assetId) return;
      mediaRef.current = element;
      setBlocked(false);
      void video.reportPlayback(assetId, 'play');
      stopBeats();
      timerRef.current = setInterval(() => {
        void video.reportPlayback(assetId, 'beat').then((active) => {
          if (active) return;
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
    const active = await video.reportPlayback(assetId, 'beat');
    if (!active) {
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

  return { blocked, attempt, onPlay, onStop: stopBeats, onError, takeOver };
}
