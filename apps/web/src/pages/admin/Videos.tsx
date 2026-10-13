import type { FailedVideo } from '@opencourse/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFailedVideos, useRetryVideo } from '@/hooks/adminQueries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';

function FailedVideoRow({
  video,
  onRetry,
  isRetrying,
  timeZone,
}: {
  video: FailedVideo;
  onRetry: (video: FailedVideo) => void;
  isRetrying: boolean;
  timeZone: string | undefined;
}) {
  const { t } = useTranslation('admin');
  const { formatDate } = useFormatters(timeZone);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{video.courseTitle}</p>
        <Link
          to={`/studio/courses/${video.courseId}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {video.lessonTitle}
        </Link>
        {video.errorMessage ? <p className="break-words text-sm">{video.errorMessage}</p> : null}
        <p className="text-xs text-muted-foreground">
          {t('videos.failedAt', {
            date: formatDate(new Date(video.failedAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={isRetrying}
        aria-label={t('videos.retryFor', { lesson: video.lessonTitle })}
        onClick={() => onRetry(video)}
      >
        {t('videos.retry')}
      </Button>
    </li>
  );
}

/** Uploaded videos the encoder gave up on, each with a way to send it back. */
export function AdminVideos() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useAuth();
  const query = useFailedVideos();
  const retry = useRetryVideo();
  const describeError = useServiceErrorMessage();

  const retryVideo = async (video: FailedVideo) => {
    try {
      await retry.mutateAsync(video.assetId);
      toast.success(t('admin:videos.retriedToast'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('admin:videos.emptyTitle')}
        description={t('admin:videos.emptyDescription')}
      />
    );
  } else {
    body = (
      <ul
        className="divide-y rounded-xl border bg-surface"
        aria-label={t('admin:videos.listLabel')}
      >
        {query.data.map((video) => (
          <FailedVideoRow
            key={video.assetId}
            video={video}
            onRetry={(failed) => void retryVideo(failed)}
            isRetrying={retry.isPending && retry.variables === video.assetId}
            timeZone={user?.timeZone}
          />
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="admin-videos-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="admin-videos-heading" className="text-xl font-semibold">
          {t('admin:videos.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('admin:videos.description')}</p>
      </div>
      {body}
    </section>
  );
}
