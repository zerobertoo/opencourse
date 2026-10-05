import { z } from 'zod';

/** Interface languages supported at the start of the project. */
export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Platform access roles (RBAC). */
export const roleSchema = z.enum(['student', 'instructor', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/** Ids are UUIDs everywhere: the database generates them and the demo seed derives them. */
export const idSchema = z.uuid();

/** Dates travel as ISO 8601 so they are serializable (JSON, sessionStorage, API). */
export const isoDateSchema = z.string().datetime();
