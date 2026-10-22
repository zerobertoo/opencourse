/**
 * An address the API returned for a file it serves (it starts with `/api/`), made absolute against
 * the API origin so an `<img>` loads it from there and not from the web app. Other addresses, and
 * every address in demo mode, stay as they are.
 */
export function resolveApiFileUrl(url: string, apiOrigin = import.meta.env.VITE_API_URL): string {
  if (!apiOrigin || !url.startsWith('/api/')) return url;
  return `${String(apiOrigin).replace(/\/+$/, '')}${url}`;
}
