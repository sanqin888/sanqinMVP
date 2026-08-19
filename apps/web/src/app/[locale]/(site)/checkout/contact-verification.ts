import { isValidCanadianPhone } from "@/lib/phone";

export type VerifiedContacts = {
  verifiedEmail: string | null;
  verifiedPhone: string | null;
};

export function normalizeCheckoutEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function reconcileVerifiedContacts(
  currentEmail: string,
  currentPhone: string,
  verified: VerifiedContacts,
): VerifiedContacts {
  return {
    verifiedEmail:
      normalizeCheckoutEmail(currentEmail) === verified.verifiedEmail
        ? verified.verifiedEmail
        : null,
    verifiedPhone:
      currentPhone === verified.verifiedPhone ? verified.verifiedPhone : null,
  };
}

export function selectVerifiedCheckoutContact(
  currentEmail: string,
  currentPhone: string,
  verified: VerifiedContacts,
): "email" | "phone" | null {
  if (currentEmail.length > 0 && currentEmail === verified.verifiedEmail) {
    return "email";
  }
  if (currentPhone.length > 0 && currentPhone === verified.verifiedPhone) {
    return "phone";
  }
  return null;
}

export function buildCheckoutContactPayload(
  normalizedEmail: string,
  normalizedPhone: string,
): { email?: string; phone?: string } {
  return {
    email: normalizedEmail || undefined,
    phone: normalizedPhone || undefined,
  };
}

export function resolveDeliveryPhoneState(params: {
  enteredPhone: string;
  memberPhone: string | null;
  memberPhoneVerified: boolean;
}) {
  const hasSubmittedPhone = params.enteredPhone.trim().length > 0;
  const submittedPhoneValid = isValidCanadianPhone(params.enteredPhone);
  const usesVerifiedMemberFallback = Boolean(
    !hasSubmittedPhone &&
      params.memberPhone &&
      params.memberPhoneVerified &&
      isValidCanadianPhone(params.memberPhone),
  );

  return {
    hasSubmittedPhone,
    submittedPhoneValid,
    usesVerifiedMemberFallback,
    hasDeliveryPhone: submittedPhoneValid || usesVerifiedMemberFallback,
  };
}
