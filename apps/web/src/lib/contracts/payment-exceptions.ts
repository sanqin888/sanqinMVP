/** Display-only payment exception workflow contract. Provider truth stays in Payments. */
export type PaymentExceptionCase = {
  caseStableId: string;
  attemptId: string;
  storeStableId: string;
  externalPaymentId: string;
  amountCents: number;
  currency: string;
  action:
    | "SANDBOX_CONFIRM_UNPAID"
    | "RELEASE_CONFIRMED_FAILURE"
    | "INVESTIGATE_ONLY";
  mode: "SANDBOX" | "PRODUCTION";
  status:
    | "REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "EXECUTING"
    | "NEEDS_REVIEW"
    | "COMPLETED";
  requestedByStableId: string;
  operatorNote: string;
  cloverOrderId: string | null;
  approvedByStableId: string | null;
  createdAt: string;
  updatedAt: string;
};
