/** Escapes LIKE wildcards so a search for "50%" does not match everything. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
