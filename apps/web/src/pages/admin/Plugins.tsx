import { videoProviders } from '@opencourse/shared';
import { KeyRound, PlugZap, Video, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/** Extension points of the platform; the ones with a `to` already have an admin screen. */
const EXTENSIONS = [
  { id: 'webhooks', icon: Webhook, to: '/admin/webhooks' },
  { id: 'apiTokens', icon: KeyRound, to: '/admin/api-keys' },
  { id: 'examplePlugin', icon: PlugZap, to: undefined },
] as const;

/** Lists the extension points, linking to the ones that are available and marking the rest. */
export function AdminPlugins() {
  const { t } = useTranslation('admin');

  return (
    <section aria-labelledby="admin-plugins-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 id="admin-plugins-heading" className="text-xl font-semibold">
          {t('plugins.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('plugins.description')}</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={t('plugins.listLabel')}>
        {EXTENSIONS.map(({ id, icon: Icon, to }) => (
          <li key={id} className="flex min-w-0">
            <Card className="flex w-full items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">
                    {to ? (
                      <Link to={to} className="hover:underline">
                        {t(`plugins.items.${id}.name`)}
                      </Link>
                    ) : (
                      t(`plugins.items.${id}.name`)
                    )}
                  </h3>
                  {to ? (
                    <Badge variant="success">{t('plugins.available')}</Badge>
                  ) : (
                    <Badge>{t('plugins.comingSoon')}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(`plugins.items.${id}.description`)}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <section aria-labelledby="admin-video-providers-heading" className="space-y-3 pt-2">
        <div className="space-y-1">
          <h3 id="admin-video-providers-heading" className="text-lg font-semibold">
            {t('plugins.videoProviders.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('plugins.videoProviders.description')}</p>
        </div>
        <ul
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          aria-label={t('plugins.videoProviders.listLabel')}
        >
          {videoProviders.map((provider) => (
            <li key={provider.id} className="flex min-w-0">
              <Card className="flex w-full items-center gap-3 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Video className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {provider.label}
                </span>
                <Badge variant="success">{t('plugins.videoProviders.installed')}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
