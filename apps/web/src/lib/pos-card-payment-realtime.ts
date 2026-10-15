import type { PosCardPaymentResult } from "./api/pos";

export type PosCardPaymentRealtimeEvent = {
  attemptId: string;
  paymentId: string | null;
  status: PosCardPaymentResult["status"];
  failureCode?: string | null;
  failureMessage?: string | null;
  customerPromptPending?: boolean;
  customerRetryRequested?: boolean;
  canResumeOriginalSale?: boolean;
  terminalInteractionTimedOut?: boolean;
  benefitsReleaseComplete?: boolean;
  terminalReadyForNextSale?: boolean;
  cancellationPending?: boolean;
  messageKind?: "SNAPSHOT" | "NOTICE";
  externalAmountCents?: number;
  surchargeCents?: number | null;
  chargedTotalCents?: number | null;
  pointsCents?: number;
  balanceCents?: number;
  couponDiscountCents?: number;
  orderStableId?: string | null;
  orderNumber?: string | null;
  pickupCode?: string | null;
};

/** A browser pending marker is never cancellation authority. */
export function canUnlockCancelledPosCheckout(result: PosCardPaymentResult): boolean {
  return (
    result.status === "CANCELLED" &&
    result.benefitsReleaseComplete === true
  );
}

const isCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

// Historical/rolling-deploy realtime events can be state-only. Never coerce
// missing canonical amounts to zero or accept notices as payment finality.
export function parsePosCardPaymentSnapshot(
  event: PosCardPaymentRealtimeEvent,
): PosCardPaymentResult | null {
  if (event.messageKind === "NOTICE") return null;
  const {
    externalAmountCents,
    surchargeCents,
    chargedTotalCents,
    pointsCents,
    balanceCents,
    couponDiscountCents,
  } = event;
  if (
    !isCents(externalAmountCents) ||
    !isCents(pointsCents) ||
    !isCents(balanceCents) ||
    !isCents(couponDiscountCents) ||
    (surchargeCents !== null && !isCents(surchargeCents)) ||
    (chargedTotalCents !== null && !isCents(chargedTotalCents))
  ) {
    return null;
  }
  return {
    attemptId: event.attemptId,
    paymentId: event.paymentId,
    status: event.status,
    failureCode: event.failureCode ?? null,
    failureMessage: event.failureMessage ?? null,
    ...(event.customerPromptPending !== undefined && {
      customerPromptPending: event.customerPromptPending,
    }),
    ...(event.customerRetryRequested !== undefined && {
      customerRetryRequested: event.customerRetryRequested,
    }),
    ...(event.canResumeOriginalSale !== undefined && {
      canResumeOriginalSale: event.canResumeOriginalSale,
    }),
    ...(event.terminalInteractionTimedOut !== undefined && {
      terminalInteractionTimedOut: event.terminalInteractionTimedOut,
    }),
    ...(event.benefitsReleaseComplete !== undefined && {
      benefitsReleaseComplete: event.benefitsReleaseComplete,
    }),
    ...(event.terminalReadyForNextSale !== undefined && {
      terminalReadyForNextSale: event.terminalReadyForNextSale,
    }),
    ...(event.cancellationPending !== undefined && {
      cancellationPending: event.cancellationPending,
    }),
    externalAmountCents,
    surchargeCents,
    chargedTotalCents,
    pointsCents,
    balanceCents,
    couponDiscountCents,
    orderStableId: event.orderStableId ?? null,
    orderNumber: event.orderNumber ?? null,
    pickupCode: event.pickupCode ?? null,
  };
}

const stateRank: Record<PosCardPaymentResult["status"], number> = {
  CREATED: 0,
  PROCESSING: 1,
  UNKNOWN: 2,
  RECONCILING: 3,
  SUCCEEDED: 4,
  DECLINED: 4,
  CANCELLED: 4,
  FAILED: 4,
};

const isFinalStatus = (status: PosCardPaymentResult["status"]) =>
  stateRank[status] === 4;

// HTTP responses and socket events can arrive in either order. Keep terminal
// states terminal, reject stale progress and preserve known canonical amounts.
export function mergePosCardPaymentSnapshot(
  previous: PosCardPaymentResult | null,
  incoming: PosCardPaymentResult,
): PosCardPaymentResult | null {
  if (!previous) return incoming;
  if (incoming.attemptId !== previous.attemptId) return previous;
  if (isFinalStatus(previous.status) && incoming.status !== previous.status) {
    return previous;
  }
  if (stateRank[incoming.status] < stateRank[previous.status]) return previous;
  if (previous.orderStableId && !incoming.orderStableId) return previous;
  if (previous.paymentId && incoming.paymentId && previous.paymentId !== incoming.paymentId) {
    return previous;
  }
  return {
    ...incoming,
    paymentId: incoming.paymentId ?? previous.paymentId,
    customerPromptPending: incoming.customerPromptPending ?? previous.customerPromptPending,
    customerRetryRequested: incoming.customerRetryRequested ?? previous.customerRetryRequested,
    canResumeOriginalSale:
      incoming.canResumeOriginalSale ??
      (incoming.status === previous.status ? previous.canResumeOriginalSale : false),
    terminalInteractionTimedOut:
      incoming.terminalInteractionTimedOut ??
      (incoming.status === previous.status ? previous.terminalInteractionTimedOut : false),
    benefitsReleaseComplete: incoming.benefitsReleaseComplete ?? previous.benefitsReleaseComplete,
    terminalReadyForNextSale: incoming.terminalReadyForNextSale ?? previous.terminalReadyForNextSale,
    cancellationPending: incoming.cancellationPending ?? previous.cancellationPending,
    surchargeCents: incoming.surchargeCents ?? previous.surchargeCents,
    chargedTotalCents: incoming.chargedTotalCents ?? previous.chargedTotalCents,
    orderStableId: incoming.orderStableId ?? previous.orderStableId,
    orderNumber: incoming.orderNumber ?? previous.orderNumber,
    pickupCode: incoming.pickupCode ?? previous.pickupCode,
  };
}
