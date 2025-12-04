///Users/apple/sanqinMVP/apps/web/src/lib
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_REGEX = /^c[0-9a-z]{8,}$/i;

export function isStableId(value: unknown): value is string {
  return typeof value === 'string' && (UUID_REGEX.test(value) || CUID_REGEX.test(value));
}
