import {
  defaultEnabledVideoProviders,
  isHttpUrl,
  platformSettingsProblem,
  platformSettingsSchema,
  type PlatformSettings,
  type UpdatePlatformSettingsRequest,
} from '@opencourse/shared';
import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../audit';
import type { Config } from '../../config';
import { settings } from '../../db/schema';
import { badRequest } from '../../errors';
import type { Database } from '../../plugins/db';

const PLATFORM_KEY = 'platform';
const SMTPS_PORT = 465;
/** Arbitrary constant, next to the other advisory locks (7_301_001 and 7_301_002 in users/service). */
const SETTINGS_LOCK_ID = 7_301_003;

/** What the platform uses until an admin saves something: branding stock, e-mail from the environment. */
export function defaultPlatformSettings(config: Config): PlatformSettings {
  return {
    brand: { name: 'OpenCourse', logoUrl: null, primaryColor: '#2f6f5e' },
    enabledLocales: ['pt-BR', 'en'],
    defaultLocale: 'pt-BR',
    email: {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      username: config.SMTP_USER ?? '',
      fromAddress: config.SMTP_FROM,
      secure: config.SMTP_PORT === SMTPS_PORT,
    },
    video: {
      watermarkEnabled: false,
      singleStreamEnabled: true,
      enabledVideoProviders: [...defaultEnabledVideoProviders],
    },
  };
}

/** Saved settings over the defaults. A row that no longer parses falls back to the defaults. */
export async function loadPlatformSettings(
  db: Pick<Database, 'select'>,
  config: Config,
): Promise<PlatformSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, PLATFORM_KEY));
  const parsed = platformSettingsSchema.safeParse(row?.value);
  if (!parsed.success) return defaultPlatformSettings(config);
  const { brand } = parsed.data;
  // a logo saved before the address was validated must not be served, nor merged into a new save
  return brand.logoUrl && !isHttpUrl(brand.logoUrl)
    ? { ...parsed.data, brand: { ...brand, logoUrl: null } }
    : parsed.data;
}

/** Merges the patch into the current settings, validates the result and stores it. */
export async function updatePlatformSettings(
  db: Database,
  config: Config,
  patch: UpdatePlatformSettingsRequest,
  actorId: string,
): Promise<PlatformSettings> {
  return db.transaction(async (tx) => {
    // the row may not exist yet, so the lock is what keeps two admins from merging into the same base
    await tx.execute(sql`select pg_advisory_xact_lock(${SETTINGS_LOCK_ID})`);
    const current = await loadPlatformSettings(tx, config);
    const merged = platformSettingsSchema.safeParse({
      ...current,
      ...patch,
      brand: { ...current.brand, ...patch.brand },
      email: { ...current.email, ...patch.email },
      video: { ...current.video, ...patch.video },
    });
    if (!merged.success) throw badRequest('Invalid settings');
    const problem = platformSettingsProblem(merged.data);
    if (problem) throw badRequest(problem);
    // empty values only exist in the blanked copy non-admins get; saving them would break every e-mail
    if (!merged.data.email.host.trim() || !merged.data.email.fromAddress.trim()) {
      throw badRequest('The e-mail server needs a host and a from address');
    }

    await tx
      .insert(settings)
      .values({ key: PLATFORM_KEY, value: merged.data })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: merged.data, updatedAt: new Date() },
      });
    await recordAudit(tx, {
      actorId,
      action: 'settings.updated',
      targetType: 'settings',
      targetId: null,
      metadata: { fields: Object.keys(patch) },
    });
    return merged.data;
  });
}

/** Non-admins only need branding and languages; the mail server details stay with admins. */
export function withoutEmailDetails(value: PlatformSettings): PlatformSettings {
  return { ...value, email: { host: '', port: 1, username: '', fromAddress: '', secure: false } };
}
