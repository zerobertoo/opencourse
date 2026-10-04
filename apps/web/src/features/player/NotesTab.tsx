import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { LessonNote } from '@opencourse/shared';
import { ErrorState } from '@/components/StateViews';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import { useLessonNote, useSaveLessonNote } from '@/hooks/queries';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Editor for a loaded note. Remounted (by `key`) whenever the saved note changes. */
function NoteEditor({
  lessonId,
  note,
  timeZone,
}: {
  lessonId: string;
  note: LessonNote | null;
  timeZone: string;
}) {
  const { t } = useTranslation(['player', 'common']);
  const { formatDate } = useFormatters(timeZone);
  const describeError = useServiceErrorMessage();
  const save = useSaveLessonNote(lessonId);
  const savedContent = note?.content ?? '';
  const [draft, setDraft] = useState(savedContent);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft, {
          onSuccess: () => toast.success(t('notes.savedToast')),
          onError: (error) => toast.error(describeError(error)),
        });
      }}
    >
      <label htmlFor="lesson-note" className="text-sm font-medium">
        {t('notes.label')}
      </label>
      <Textarea
        id="lesson-note"
        value={draft}
        placeholder={t('notes.placeholder')}
        rows={6}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={draft === savedContent || save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t('notes.save')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {note
            ? t('notes.lastSaved', {
                date: formatDate(new Date(note.updatedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : t('notes.empty')}
        </span>
      </div>
    </form>
  );
}

/** Personal notes for the lesson, saved explicitly. */
export function NotesTab({ lessonId, timeZone }: { lessonId: string; timeZone: string }) {
  const { t } = useTranslation(['player', 'common']);
  const note = useLessonNote(lessonId);

  if (note.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-10 w-24" />
      </div>
    );
  }
  if (note.isError) return <ErrorState onRetry={() => void note.refetch()} />;

  return (
    <NoteEditor
      key={note.data?.updatedAt ?? 'empty'}
      lessonId={lessonId}
      note={note.data}
      timeZone={timeZone}
    />
  );
}
