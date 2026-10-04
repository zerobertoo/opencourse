import { useTranslation } from 'react-i18next';
import { isServiceError } from '@/services';

/** Turns any error thrown by a service into a message for the user. */
export function useServiceErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation('errors');
  return (error) => (isServiceError(error) ? t(`service.${error.code}`) : t('service.unknown'));
}
