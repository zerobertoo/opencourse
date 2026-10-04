import { Award, GraduationCap, LayoutDashboard, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Two-letter initials used as the avatar placeholder. */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Account menu in the topbar; shows a sign-in link when nobody is authenticated. */
export function UserMenu() {
  const { t } = useTranslation(['common', 'auth', 'errors']);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link to="/login">{t('auth:login.submit')}</Link>
      </Button>
    );
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      toast.error(t('errors:service.unknown'));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('userMenu.open', { name: user.name })}>
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
          >
            {getInitials(user.name)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">
            <GraduationCap aria-hidden="true" />
            {t('nav.student')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/certificates">
            <Award aria-hidden="true" />
            {t('nav.certificates')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden="true" />
            {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        {user.role === 'instructor' || user.role === 'admin' ? (
          <DropdownMenuItem asChild>
            <Link to="/studio">
              <LayoutDashboard aria-hidden="true" />
              {t('nav.studio')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {user.role === 'admin' ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck aria-hidden="true" />
              {t('nav.admin')}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <LogOut aria-hidden="true" />
          {t('userMenu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
