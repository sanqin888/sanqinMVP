const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'authorization',
  'code',
  'id_token',
  'password',
  'refresh_token',
  'sessionid',
  'session_id',
  'token',
]);

export function sanitizeUrlForLog(value: string): string {
  const [path, query = ''] = value.split('?');
  if (!query) return path;

  const params = new URLSearchParams(query);
  let changed = false;

  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }

  return changed ? `${path}?${params.toString()}` : value;
}
