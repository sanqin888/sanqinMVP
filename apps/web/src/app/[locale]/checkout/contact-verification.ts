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
