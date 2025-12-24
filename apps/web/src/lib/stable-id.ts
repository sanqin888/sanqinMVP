///Users/apple/sanqinMVP/apps/web/src/lib
// cuid v1: 25 chars, starts with 'c'
const CUID1_REGEX = /^c[0-9a-z]{24}$/i;

export function isStableId(value: unknown): value is string {
  return typeof value === "string" && CUID1_REGEX.test(value);
}
