import { z } from 'zod';
import { localeSchema } from './base';
import { defaultEnabledVideoProviders, findVideoProvider } from './video-providers';

export const platformSettingsSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  enabledLocales: z.array(localeSchema).min(1),
  defaultLocale: localeSchema,
  email: z.object({
    host: z.string(),
    port: z.number().int().min(1).max(65535),
    username: z.string(),
    fromAddress: z.string(),
    secure: z.boolean(),
  }),
  // settings saved before this group existed still parse, with the watermark off; those saved
  // before the single-stream option still parse too, with it on, and before the provider list
  // with the default providers
  video: z
    .object({
      watermarkEnabled: z.boolean(),
      singleStreamEnabled: z.boolean().default(true),
      // ids of the providers that accept new links; lessons that already use another one keep playing
      enabledVideoProviders: z.array(z.string()).default([...defaultEnabledVideoProviders]),
    })
    .default({
      watermarkEnabled: false,
      singleStreamEnabled: true,
      enabledVideoProviders: [...defaultEnabledVideoProviders],
    }),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

// The name may not hold characters the mail library reads as address-list syntax (`,` `;` `@`,
// quotes), so one value can never turn into several From addresses.
const DISPLAY_NAME_ADDRESS = /^[^<>\r\n,;:"@\\]*<([^<>\s]+)>$/;

/** True for `user@host`, `<user@host>` and `Display Name <user@host>`, the forms accepted as `From`. */
export function isSenderAddress(value: string): boolean {
  const trimmed = value.trim();
  const bare = DISPLAY_NAME_ADDRESS.exec(trimmed)?.[1] ?? trimmed;
  return z.email().safeParse(bare).success;
}

/** True for an absolute http or https address; anything else (`javascript:`, `data:`) is refused. */
export function isHttpUrl(value: string): boolean {
  return z.url({ protocol: /^https?$/ }).safeParse(value).success;
}

/** Merged-then-validated by the server, so every group may carry only the fields that change. */
export const updatePlatformSettingsRequestSchema = z
  .object({
    brand: platformSettingsSchema.shape.brand
      .extend({ logoUrl: z.string().refine(isHttpUrl, 'Enter an http(s) address').nullable() })
      .partial()
      .strict()
      .optional(),
    enabledLocales: platformSettingsSchema.shape.enabledLocales.optional(),
    defaultLocale: localeSchema.optional(),
    email: platformSettingsSchema.shape.email
      .extend({
        fromAddress: z.string().trim().refine(isSenderAddress, 'Enter an e-mail, or Name <e-mail>'),
      })
      .partial()
      .strict()
      .optional(),
    // plain booleans: a default inside a patch would overwrite a stored value that was left out
    video: z
      .object({
        watermarkEnabled: z.boolean(),
        singleStreamEnabled: z.boolean(),
        enabledVideoProviders: z.array(
          z.string().refine((id) => findVideoProvider(id) !== undefined, 'Unknown video provider'),
        ),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();
export type UpdatePlatformSettingsRequest = z.infer<typeof updatePlatformSettingsRequestSchema>;

/** Why a settings change was refused, or null when the default language is among the enabled ones. */
export function platformSettingsProblem(settings: PlatformSettings): string | null {
  return settings.enabledLocales.includes(settings.defaultLocale)
    ? null
    : 'The default language must be enabled';
}
