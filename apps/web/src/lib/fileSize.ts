/** File size in the largest sensible unit (B, kB, MB), formatted for the given locale. */
export function formatFileSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes >= 1_000_000
      ? ([bytes / 1_000_000, 'megabyte'] as const)
      : bytes >= 1_000
        ? ([bytes / 1_000, 'kilobyte'] as const)
        : ([bytes, 'byte'] as const);
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value);
}
