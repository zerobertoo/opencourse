import type { PlatformSettings } from '@opencourse/shared';

export interface SettingsService {
  get(): Promise<PlatformSettings>;
  /** Somente admin. Mescla os campos informados e valida o resultado. */
  update(patch: Partial<PlatformSettings>): Promise<PlatformSettings>;
}
