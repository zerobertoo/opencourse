import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/theme/useTheme';

/** Global toasts following the active theme; colors come from the tokens, not Sonner's own palette. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
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
