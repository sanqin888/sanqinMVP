///Users/apple/sanqinMVP/apps/web/src/lib
// cuid v1: 25 chars, starts with 'c'
const CUID1_REGEX = /^c[0-9a-z]{24}$/i;
// cuid2: 24 chars base36（Prisma cuid2() 常见形态），不含 '-'
const CUID2_REGEX = /^[0-9a-z]{24}$/i;

export function isStableId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (CUID1_REGEX.test(value) || CUID2_REGEX.test(value))
  );
}
