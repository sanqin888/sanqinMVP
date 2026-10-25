// Session-scoped POS editing preferences, never payment authorization or HOLD
// status. Customer PII and historical pricing are intentionally not stored.
const KEY = "sanq.pos.checkout-edit.v1";

export type PosCheckoutEditDraft = {
  memberStableId: string | null;
  fulfillment: "pickup" | "dine_in" | null;
  paymentMethod: string;
  redeemPointsInput: string;
  useBalanceInput: string;
  discountOption: "5" | "10" | "15" | "other" | null;
  otherDiscountInput: string;
};

export function readPosCheckoutEditDraft(): PosCheckoutEditDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const value = input as Record<string, unknown>;
    if (
      typeof value.redeemPointsInput !== "string" ||
      typeof value.useBalanceInput !== "string" ||
      typeof value.otherDiscountInput !== "string" ||
      typeof value.paymentMethod !== "string"
    ) return null;
    return {
      memberStableId:
        typeof value.memberStableId === "string" ? value.memberStableId : null,
      fulfillment:
        value.fulfillment === "pickup" || value.fulfillment === "dine_in"
          ? value.fulfillment : null,
      paymentMethod: value.paymentMethod,
      redeemPointsInput: value.redeemPointsInput,
      useBalanceInput: value.useBalanceInput,
      discountOption:
        value.discountOption === "5" || value.discountOption === "10" ||
        value.discountOption === "15" || value.discountOption === "other"
          ? value.discountOption : null,
      otherDiscountInput: value.otherDiscountInput,
    };
  } catch {
    return null;
  }
}

export function savePosCheckoutEditDraft(draft: PosCheckoutEditDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // This cache is optional. Financial locks live only on the server.
  }
}

export function clearPosCheckoutEditDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Ignore optional browser storage failure.
  }
}
