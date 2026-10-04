import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface Formatters {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (fraction: number) => string;
}

/**
 * Cria formatadores baseados em `Intl` para o idioma e o fuso informados.
 * @param locale idioma BCP 47 (ex.: `pt-BR`)
 * @param timeZone fuso IANA do usuário; quando ausente usa o do navegador
 */
export function createFormatters(locale: string, timeZone?: string): Formatters {
  return {
    formatDate: (value, options = { dateStyle: 'long' }) =>
      new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(value),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
    formatPercent: (fraction) =>
      new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
        fraction,
      ),
  };
}

/** Formatadores que acompanham o idioma ativo da interface. */
export function useFormatters(timeZone?: string): Formatters {
  const { i18n } = useTranslation();
  return useMemo(() => createFormatters(i18n.language, timeZone), [i18n.language, timeZone]);
}
