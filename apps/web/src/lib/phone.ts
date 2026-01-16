// apps/web/src/lib/phone.ts
export const CANADIAN_COUNTRY_CODE = "+1";
export const CANADIAN_PHONE_DIGITS = 10;

export const normalizeCanadianPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const trimmed =
    digits.length > CANADIAN_PHONE_DIGITS && digits.startsWith("1")
      ? digits.slice(1)
      : digits;
  return trimmed.slice(0, CANADIAN_PHONE_DIGITS);
};

export const stripCanadianCountryCode = (value: string | null | undefined) =>
  normalizeCanadianPhoneInput(value ?? "");

export const formatCanadianPhoneForApi = (digits: string) =>
  digits ? `${CANADIAN_COUNTRY_CODE}${digits}` : "";

export const formatCanadianPhoneForDisplay = (digits: string) =>
  digits ? `${CANADIAN_COUNTRY_CODE} ${digits}` : CANADIAN_COUNTRY_CODE;

export const isValidCanadianPhone = (digits: string) =>
  digits.length === CANADIAN_PHONE_DIGITS;
