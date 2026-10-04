import ptBRAdmin from './locales/pt-BR/admin.json';
import ptBRAuth from './locales/pt-BR/auth.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRErrors from './locales/pt-BR/errors.json';
import ptBRPlayer from './locales/pt-BR/player.json';
import ptBRStudent from './locales/pt-BR/student.json';
import ptBRStudio from './locales/pt-BR/studio.json';
import enAdmin from './locales/en/admin.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enErrors from './locales/en/errors.json';
import enPlayer from './locales/en/player.json';
import enStudent from './locales/en/student.json';
import enStudio from './locales/en/studio.json';

/** Namespaces por área da aplicação. */
export const NAMESPACES = [
  'common',
  'auth',
  'student',
  'studio',
  'admin',
  'player',
  'errors',
] as const;

export const resources = {
  'pt-BR': {
    common: ptBRCommon,
    auth: ptBRAuth,
    student: ptBRStudent,
    studio: ptBRStudio,
    admin: ptBRAdmin,
    player: ptBRPlayer,
    errors: ptBRErrors,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    student: enStudent,
    studio: enStudio,
    admin: enAdmin,
    player: enPlayer,
    errors: enErrors,
  },
} as const;
