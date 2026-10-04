import type { CourseDetail } from '@opencourse/shared';
import { CircleCheck, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { localizeLesson, localizeModuleTitle, toLocale } from '@/lib/content';
import { formatClock } from '@/lib/duration';
import { cn } from '@/lib/utils';

interface CurriculumSidebarProps {
  course: CourseDetail;
  currentLessonId: string;
  completedIds: ReadonlySet<string>;
  unlockedIds: ReadonlySet<string>;
}

/** Side curriculum of the player: modules, lessons, status and the current lesson highlighted. */
export function CurriculumSidebar({
  course,
  currentLessonId,
  completedIds,
  unlockedIds,
}: CurriculumSidebarProps) {
  const { t, i18n } = useTranslation('player');
  const locale = toLocale(i18n.resolvedLanguage);
  const modules = [...course.modules].sort((a, b) => a.order - b.order);

  return (
    <nav aria-label={t('curriculum.title')} className="space-y-5">
      {modules.map((courseModule) => (
        <section key={courseModule.id} className="space-y-1">
          <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {localizeModuleTitle(courseModule, locale, course.defaultLocale)}
          </h3>
          <ul>
            {[...courseModule.lessons]
              .sort((a, b) => a.order - b.order)
              .map((lesson) => {
                const isCurrent = lesson.id === currentLessonId;
                const isCompleted = completedIds.has(lesson.id);
                const isLocked = !unlockedIds.has(lesson.id);
                const title = localizeLesson(lesson, locale, course.defaultLocale).title;
                const content = (
                  <>
                    <LessonTypeIcon
                      type={lesson.type}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 text-sm">{title}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatClock(lesson.durationSeconds)}
                    </span>
                    {isCompleted ? (
                      <CircleCheck
                        className="size-4 shrink-0 text-primary"
                        aria-label={t('curriculum.completed')}
                      />
                    ) : isLocked ? (
                      <Lock
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-label={t('curriculum.locked')}
                      />
                    ) : null}
                  </>
                );
                return (
                  <li key={lesson.id}>
                    {isLocked ? (
                      <div className="flex items-center gap-2 rounded-md px-2 py-2.5 opacity-60">
                        {content}
                      </div>
                    ) : (
                      <Link
                        to={`/courses/${course.slug}/lessons/${lesson.id}`}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2 py-2.5 hover:bg-muted',
                          isCurrent && 'bg-accent font-medium text-accent-foreground',
                        )}
                      >
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
