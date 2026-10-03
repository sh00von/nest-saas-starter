/** Joins a base URL (which may include a path) with a path and query params. */
export function buildUrl(
  base: string,
  path: string,
  params: Record<string, string> = {},
): string {
  const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const query = new URLSearchParams(params).toString();
  return query ? `${url}?${query}` : url;
}
