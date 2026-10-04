import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/useTheme';

/** Toggles between light and dark theme. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setPreference } = useTheme();
  const target = resolvedTheme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('theme.switchTo', { theme: target })}
      onClick={() => setPreference(target)}
    >
      {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
