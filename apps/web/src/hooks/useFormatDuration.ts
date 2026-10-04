import { useTranslation } from 'react-i18next';
import { splitHoursMinutes } from '@/lib/duration';

/** Human duration such as "2h 30min", translated for the active language. */
export function useFormatDuration(): (totalSeconds: number) => string {
  const { t } = useTranslation('student');
  return (totalSeconds) => {
    const { hours, minutes } = splitHoursMinutes(totalSeconds);
    if (hours > 0 && minutes > 0) return t('duration.hoursMinutes', { hours, minutes });
    if (hours > 0) return t('duration.hours', { hours });
    return t('duration.minutes', { minutes });
  };
}
