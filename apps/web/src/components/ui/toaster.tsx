import { Toaster as SonnerToaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/useTheme';

/** Global toasts following the active theme; colors come from the tokens, not Sonner's own palette. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      containerAriaLabel={t('states.notifications')}
      closeButton
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--surface-foreground)',
          '--normal-border': 'var(--border)',
          '--error-bg': 'var(--surface)',
          '--error-text': 'var(--destructive)',
          '--error-border': 'var(--destructive)',
        } as React.CSSProperties
      }
    />
  );
}
