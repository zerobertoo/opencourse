import type { Caption } from '@opencourse/shared';
import { I18nProvider } from '@videojs/react/i18n';
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video';
import { Video, VideoPlayer as VideoJsPlayer, VideoSkin } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import { useCallback, useEffect, useRef, type CSSProperties, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** How often (in seconds of playback) the position is reported while playing. */
const POSITION_SAVE_INTERVAL_SECONDS = 5;

/** The skin takes its colors from our theme tokens, so it follows the brand color and dark mode. */
const SKIN_STYLE = {
  width: '100%',
  aspectRatio: '16 / 9',
  '--media-accent-color': 'var(--primary)',
  '--media-accent-text-color': 'var(--primary-foreground)',
  '--media-border-radius': 'var(--radius-xl, 0.75rem)',
  '--media-font-family': 'var(--font-sans, inherit)',
} as CSSProperties;

interface VideoPlayerProps {
  /** An HLS playlist (`.m3u8`) or a plain video file. */
  src: string;
  title: string;
  captions: Caption[];
  /** Saved position to resume from, in seconds. */
  initialPositionSeconds: number;
  /** Receives the playback position (whole seconds) periodically and when playback stops. */
  onPositionChange: (seconds: number) => void;
  onEnded: () => void;
}

const isHlsSource = (src: string) => /\.m3u8(\?|#|$)/i.test(src);

/**
 * Lesson video player built on Video.js 10: its skin brings the controls (quality, speed,
 * captions, fullscreen, keyboard shortcuts and translated labels), and hls.js plays the
 * adaptive streams. This component adds position resume and reporting.
 * Mount it with `key={lessonId}` so state resets between lessons.
 */
export function VideoPlayer({
  src,
  title,
  captions,
  initialPositionSeconds,
  onPositionChange,
  onEnded,
}: VideoPlayerProps) {
  const { t, i18n } = useTranslation('player');
  const lastSavedRef = useRef(0);
  const dirtyRef = useRef(false);
  const currentRef = useRef(0);
  const callbacksRef = useRef({ onPositionChange, onEnded });

  useEffect(() => {
    callbacksRef.current = { onPositionChange, onEnded };
  });

  /** Reports the position if it changed since the last report. */
  const flushPosition = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    lastSavedRef.current = currentRef.current;
    callbacksRef.current.onPositionChange(Math.floor(currentRef.current));
  }, []);

  // save the position when leaving the lesson
  useEffect(() => flushPosition, [flushPosition]);

  const mediaProps = {
    playsInline: true,
    preload: 'metadata' as const,
    'aria-label': title,
    onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      // resume where the student stopped, unless that was (almost) the end
      if (initialPositionSeconds > 0 && initialPositionSeconds < video.duration - 1) {
        video.currentTime = initialPositionSeconds;
        currentRef.current = initialPositionSeconds;
        lastSavedRef.current = initialPositionSeconds;
      }
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => {
      const time = event.currentTarget.currentTime;
      currentRef.current = time;
      if (Math.abs(time - lastSavedRef.current) >= POSITION_SAVE_INTERVAL_SECONDS) {
        dirtyRef.current = true;
        flushPosition();
      }
    },
    onPause: () => {
      dirtyRef.current = true;
      flushPosition();
    },
    onEnded: () => {
      // a finished video restarts from the beginning next time
      currentRef.current = 0;
      dirtyRef.current = true;
      flushPosition();
      callbacksRef.current.onEnded();
    },
  };
  const tracks = captions.map((caption) => (
    <track
      key={caption.locale}
      kind="captions"
      srcLang={caption.locale}
      label={t(`captions.language.${caption.locale}`)}
      src={caption.url}
    />
  ));

  return (
    <div
      className="overflow-hidden rounded-xl border bg-player"
      role="group"
      aria-label={t('video.playerLabel', { title })}
    >
      <I18nProvider locale={i18n.resolvedLanguage ?? 'en'}>
        <VideoJsPlayer>
          <VideoSkin style={SKIN_STYLE}>
            {isHlsSource(src) ? (
              <HlsJsVideo src={src} {...mediaProps}>
                {tracks}
              </HlsJsVideo>
            ) : (
              <Video src={src} {...mediaProps}>
                {tracks}
              </Video>
            )}
          </VideoSkin>
        </VideoJsPlayer>
      </I18nProvider>
    </div>
  );
}
