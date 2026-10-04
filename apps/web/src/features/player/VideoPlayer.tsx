import type { Caption, Locale } from '@opencourse/shared';
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { formatClock } from '@/lib/duration';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
/** How often (in seconds of playback) the position is reported while playing. */
const POSITION_SAVE_INTERVAL_SECONDS = 5;
const SEEK_STEP_SECONDS = 5;

interface VideoPlayerProps {
  src: string;
  title: string;
  captions: Caption[];
  /** Saved position to resume from, in seconds. */
  initialPositionSeconds: number;
  /** Receives the playback position (whole seconds) periodically and when playback stops. */
  onPositionChange: (seconds: number) => void;
  onEnded: () => void;
}

/**
 * Video player with custom accessible controls: play/pause, seek, volume, speed,
 * captions per language, fullscreen, keyboard shortcuts and position resume.
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
  const { t } = useTranslation('player');
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedRef = useRef(0);
  const dirtyRef = useRef(false);
  const currentRef = useRef(0);
  const callbacksRef = useRef({ onPositionChange, onEnded });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [captionLocale, setCaptionLocale] = useState<Locale | ''>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  useEffect(() => {
    return () => flushPosition();
  }, [flushPosition]);

  // show only the selected caption track
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      if (track) track.mode = track.language === captionLocale ? 'showing' : 'disabled';
    }
  }, [captionLocale, captions]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // a refused autoplay or an interrupted play() is not a media failure
      void video.play().catch((error: DOMException) => {
        if (error.name === 'NotSupportedError') setHasError(true);
      });
    } else video.pause();
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(
      video.duration || 0,
      Math.max(0, video.currentTime + deltaSeconds),
    );
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // keyboard shortcuts while focus is inside the player (but not on its form controls)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === ' ' || event.key === 'k') togglePlay();
      else if (event.key === 'ArrowRight') seekBy(SEEK_STEP_SECONDS);
      else if (event.key === 'ArrowLeft') seekBy(-SEEK_STEP_SECONDS);
      else if (event.key === 'm') toggleMute();
      else if (event.key === 'f') toggleFullscreen();
      else return;
      event.preventDefault();
    };
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [seekBy, toggleFullscreen, toggleMute, togglePlay]);

  if (hasError) {
    return (
      <ErrorState
        title={t('video.errorTitle')}
        description={t('video.errorDescription')}
        onRetry={() => {
          setHasError(false);
          setIsBuffering(true);
        }}
      />
    );
  }

  const progressText = t('video.timeValue', {
    current: formatClock(currentTime),
    total: formatClock(duration),
  });

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border bg-player text-player-foreground"
      role="group"
      aria-label={t('video.playerLabel', { title })}
    >
      <div className="relative aspect-video">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are rendered from lesson data below */}
        <video
          ref={videoRef}
          src={src}
          className="size-full"
          preload="metadata"
          playsInline
          tabIndex={0}
          aria-label={title}
          onClick={togglePlay}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            setDuration(video.duration);
            setIsBuffering(false);
            // resume where the student stopped, unless that was (almost) the end
            if (initialPositionSeconds > 0 && initialPositionSeconds < video.duration - 1) {
              video.currentTime = initialPositionSeconds;
              currentRef.current = initialPositionSeconds;
              lastSavedRef.current = initialPositionSeconds;
              setCurrentTime(initialPositionSeconds);
            }
          }}
          onTimeUpdate={(event) => {
            const time = event.currentTarget.currentTime;
            currentRef.current = time;
            setCurrentTime(time);
            if (Math.abs(time - lastSavedRef.current) >= POSITION_SAVE_INTERVAL_SECONDS) {
              dirtyRef.current = true;
              flushPosition();
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            setIsPlaying(false);
            dirtyRef.current = true;
            flushPosition();
          }}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          onEnded={() => {
            // a finished video restarts from the beginning next time
            currentRef.current = 0;
            dirtyRef.current = true;
            flushPosition();
            callbacksRef.current.onEnded();
          }}
          onError={() => setHasError(true)}
        >
          {captions.map((caption) => (
            <track
              key={caption.locale}
              kind="captions"
              srcLang={caption.locale}
              label={t(`captions.language.${caption.locale}`)}
              src={caption.url}
            />
          ))}
        </video>
        {isBuffering ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 grid place-items-center bg-scrim/30 [&_svg]:size-8"
          >
            <Spinner />
            <span className="sr-only">{t('video.buffering')}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 bg-player-surface px-3 py-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-player-foreground hover:bg-player-foreground/10"
            aria-label={isPlaying ? t('video.pause') : t('video.play')}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(currentTime, Math.max(duration, 1))}
            aria-label={t('video.seek')}
            aria-valuetext={progressText}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
            onChange={(event) => {
              const video = videoRef.current;
              if (video) video.currentTime = Number(event.target.value);
            }}
          />
          <span className="shrink-0 font-mono text-xs tabular-nums" aria-hidden="true">
            {progressText}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-player-foreground hover:bg-player-foreground/10"
            aria-label={isMuted ? t('video.unmute') : t('video.mute')}
            aria-pressed={isMuted}
            onClick={toggleMute}
          >
            {isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
          <label className="flex items-center gap-1.5 text-xs">
            <span className="sr-only sm:not-sr-only">{t('video.speed')}</span>
            <Select
              className="h-9 w-auto border-player-foreground/20 bg-player-control py-0 text-xs text-player-foreground"
              value={rate}
              onChange={(event) => {
                const next = Number(event.target.value);
                setRate(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
            >
              {PLAYBACK_RATES.map((option) => (
                <option key={option} value={option}>
                  {t('video.rateOption', { rate: option })}
                </option>
              ))}
            </Select>
          </label>
          {captions.length > 0 ? (
            <label className="flex items-center gap-1.5 text-xs">
              <span className="sr-only sm:not-sr-only">{t('captions.label')}</span>
              <Select
                className="h-9 w-auto border-player-foreground/20 bg-player-control py-0 text-xs text-player-foreground"
                value={captionLocale}
                onChange={(event) => setCaptionLocale(event.target.value as Locale | '')}
              >
                <option value="">{t('captions.off')}</option>
                {captions.map((caption) => (
                  <option key={caption.locale} value={caption.locale}>
                    {t(`captions.language.${caption.locale}`)}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {typeof document !== 'undefined' && document.fullscreenEnabled ? (
            <Button
              variant="ghost"
              size="icon"
              className="ms-auto text-player-foreground hover:bg-player-foreground/10"
              aria-label={isFullscreen ? t('video.exitFullscreen') : t('video.fullscreen')}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
