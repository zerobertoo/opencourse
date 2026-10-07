import { useTranslation } from 'react-i18next';

/**
 * A video hosted by an external provider, shown through the provider's own player. The address
 * comes from a video provider plugin, so it only ever points at the providers we recognise.
 * These players report no position to us, so students mark such lessons complete themselves.
 */
export function ExternalVideoEmbed({ embedUrl, title }: { embedUrl: string; title: string }) {
  const { t } = useTranslation('player');
  return (
    <div className="overflow-hidden rounded-xl border bg-player">
      <iframe
        src={embedUrl}
        title={t('video.playerLabel', { title })}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
