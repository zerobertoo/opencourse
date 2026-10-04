import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@/theme/useTheme';

/** Toasts globais acompanhando o tema ativo. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return <SonnerToaster theme={resolvedTheme} richColors closeButton />;
}
