import type { CourseStatus } from '@opencourse/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

/** Visibility of a course: draft, published or archived. */
export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const { t } = useTranslation('common');
  return (
    <Badge variant={status === 'published' ? 'success' : 'neutral'}>
      {t(`courseStatus.${status}`)}
    </Badge>
  );
}
