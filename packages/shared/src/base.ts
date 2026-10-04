import { z } from 'zod';

/** Idiomas de interface suportados no início do projeto. */
export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Papéis de acesso da plataforma (RBAC). */
export const roleSchema = z.enum(['student', 'instructor', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const idSchema = z.string().min(1);

/** Datas trafegam como ISO 8601 para serem serializáveis (JSON, sessionStorage, API). */
export const isoDateSchema = z.string().datetime();
