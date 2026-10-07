/**
 * A video provider that lessons can embed by link. Adding a provider means adding a folder that
 * exports one of these and listing it in `registry.ts`; nothing else in the app changes.
 */
export interface VideoProviderPlugin {
  /** Stable identifier stored with the lesson (lowercase, no spaces). */
  id: string;
  /** Name shown to instructors. */
  label: string;
  /** Returns the provider's identifier for a URL it recognises, otherwise null. */
  match(url: URL): { externalId: string } | null;
  /** The https address to put in the player iframe. */
  embedUrl(externalId: string): string;
}

/** Host name without a leading `www.` or `m.`, in lower case. */
export function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m)\./, '');
}
