// order matters: Edge and Opera also say Chrome, and Chrome also says Safari
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

// iOS user agents also say "Mac OS X", and Android ones say "Linux"
const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** Browser and system names read from a `User-Agent`; either is null when it is not recognised. */
export function describeUserAgent(userAgent: string | null): {
  browser: string | null;
  system: string | null;
} {
  const agent = userAgent ?? '';
  const find = (table: ReadonlyArray<[RegExp, string]>) =>
    table.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
  return { browser: find(BROWSERS), system: find(SYSTEMS) };
}
