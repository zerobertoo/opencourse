import type { PlatformSettings, UpdatePlatformSettingsRequest } from '@opencourse/shared';

export interface SettingsService {
  get(): Promise<PlatformSettings>;
  /** Admin only. Merges the given fields and validates the result. */
  update(patch: UpdatePlatformSettingsRequest): Promise<PlatformSettings>;
}
