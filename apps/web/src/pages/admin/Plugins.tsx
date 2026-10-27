import { findVideoProvider, videoProviders } from '@opencourse/shared';
import { KeyRound, PlugZap, Video, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlatformSettings, useUpdateSettings } from '@/hooks/adminQueries';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Extension points of the platform; the ones with a `to` already have an admin screen. */
const EXTENSIONS = [
  { id: 'webhooks', icon: Webhook, to: '/admin/webhooks' },
  { id: 'apiTokens', icon: KeyRound, to: '/admin/api-keys' },
  { id: 'examplePlugin', icon: PlugZap, to: undefined },
] as const;

/** Lists the extension points, linking to the ones that are available and marking the rest. */
export function AdminPlugins() {
  const { t } = useTranslation('admin');
  const settings = usePlatformSettings();
  const update = useUpdateSettings();
  const describeError = useServiceErrorMessage();
  const enabledProviders = settings.data?.video.enabledVideoProviders;

  /** Saves the list at once; lessons that already use a provider keep playing either way. */
  const toggle = async (providerId: string, turnOn: boolean) => {
    if (!enabledProviders) return;
    // an id the registry no longer knows would make the API refuse the whole list, so it is dropped
    const kept = enabledProviders.filter((id) => id !== providerId && findVideoProvider(id));
    const next = turnOn ? [...kept, providerId] : kept;
    try {
      await update.mutateAsync({ video: { enabledVideoProviders: next } });
      toast.success(t('plugins.videoProviders.saved'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

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
          {videoProviders.map((provider) => {
            const enabled = enabledProviders?.includes(provider.id) ?? false;
            // nothing is claimed about a provider until the settings have loaded
            return (
              <li key={provider.id} className="flex min-w-0">
                <Card className="flex w-full items-center gap-3 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Video className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {provider.label}
                  </span>
                  {enabledProviders ? (
                    <>
                      <Badge variant={enabled ? 'success' : undefined}>
                        {t(enabled ? 'plugins.videoProviders.on' : 'plugins.videoProviders.off')}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        aria-label={t(
                          enabled
                            ? 'plugins.videoProviders.turnOff'
                            : 'plugins.videoProviders.turnOn',
                          { provider: provider.label },
                        )}
                        onClick={() => toggle(provider.id, !enabled)}
                      >
                        {t(
                          enabled
                            ? 'plugins.videoProviders.disable'
                            : 'plugins.videoProviders.enable',
                        )}
                      </Button>
                    </>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
