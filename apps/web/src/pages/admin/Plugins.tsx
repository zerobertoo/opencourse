import { KeyRound, PlugZap, Video, Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/** Extension points planned for the platform (see the PRD); none is installable yet. */
const PLANNED_EXTENSIONS = [
  { id: 'webhooks', icon: Webhook },
  { id: 'apiTokens', icon: KeyRound },
  { id: 'videoAdapters', icon: Video },
  { id: 'examplePlugin', icon: PlugZap },
] as const;

/** Placeholder listing the extensions that will be available in future versions. */
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
        {PLANNED_EXTENSIONS.map(({ id, icon: Icon }) => (
          <li key={id} className="flex min-w-0">
            <Card className="flex w-full items-start gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">
                    {t(`plugins.items.${id}.name`)}
                  </h3>
                  <Badge>{t('plugins.comingSoon')}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(`plugins.items.${id}.description`)}
                </p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
