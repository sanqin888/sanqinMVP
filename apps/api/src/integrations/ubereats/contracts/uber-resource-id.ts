export const UBER_RESOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const normalizeUberResourceId = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    !UBER_RESOURCE_ID_PATTERN.test(value)
  ) {
    return undefined;
  }

  return value;
};
