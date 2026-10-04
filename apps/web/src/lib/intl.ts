import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface Formatters {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (fraction: number) => string;
}

/**
 * Creates `Intl`-based formatters for the given language and time zone.
 * @param locale idioma BCP 47 (ex.: `pt-BR`)
 * @param timeZone the user's IANA time zone; defaults to the browser's
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

/** Formatters that follow the active interface language. */
export function useFormatters(timeZone?: string): Formatters {
  const { i18n } = useTranslation();
  return useMemo(() => createFormatters(i18n.language, timeZone), [i18n.language, timeZone]);
}
