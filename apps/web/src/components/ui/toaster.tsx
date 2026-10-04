import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/theme/useTheme';

/** Global toasts following the active theme. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return <SonnerToaster theme={resolvedTheme} richColors closeButton />;
}
