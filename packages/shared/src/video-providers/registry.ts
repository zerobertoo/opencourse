import { bunnyPlugin } from './bunny';
import { cloudflarePlugin } from './cloudflare';
import { directPlugin } from './direct';
import { pandaPlugin } from './panda';
import type { VideoProviderPlugin } from './types';
import { vimeoPlugin } from './vimeo';
import { youtubePlugin } from './youtube';

/** Every provider the app can embed. To add one, create its folder and list it here. */
export const videoProviders: readonly VideoProviderPlugin[] = [
  youtubePlugin,
  vimeoPlugin,
  bunnyPlugin,
  cloudflarePlugin,
  pandaPlugin,
  // last: a file link on one of the hosts above should be claimed by that provider first
  directPlugin,
];

export interface ResolvedVideoLink {
  plugin: string;
  externalId: string;
  embedUrl: string;
}

/** Looks a provider up by the id stored with a lesson. */
export function findVideoProvider(id: string): VideoProviderPlugin | undefined {
  return videoProviders.find((provider) => provider.id === id);
}

/** Recognises a pasted link (https only); null when no plugin claims it. */
export function resolveVideoUrl(raw: string): ResolvedVideoLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  for (const provider of videoProviders) {
    const match = provider.match(url);
    if (match) {
      return {
        plugin: provider.id,
        externalId: match.externalId,
        embedUrl: provider.embedUrl(match.externalId),
      };
    }
  }
  return null;
}
