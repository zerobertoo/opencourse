import { CirclePlay, FileDown, FileText, ListChecks, type LucideProps } from 'lucide-react';
import type { LessonType } from '@opencourse/shared';

const ICONS = {
  video: CirclePlay,
  text: FileText,
  file: FileDown,
  quiz: ListChecks,
} as const satisfies Record<LessonType, React.ComponentType<LucideProps>>;

/** Decorative icon for a lesson type; pair it with a visible or screen-reader label. */
export function LessonTypeIcon({ type, ...props }: { type: LessonType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden="true" {...props} />;
}
