import type {
  PaymentExceptionCase,
  PosCardPaymentResult,
  PosCardPaymentReviewDetail,
} from "./api/pos";
import {
  canDismissPosCardPaymentReview,
  canUnlockCancelledPosCheckout,
  canUnlockCompletedSandboxUnpaidPosCheckout,
  mergePosCardPaymentSnapshot,
  needsPosCardPaymentReadback,
  parsePosCardPaymentSnapshot,
  shouldOpenRestoredPosCardDialog,
} from "./pos-card-payment-realtime";

const complete: PosCardPaymentResult = {
  attemptId: "attempt-a",
  paymentId: "payment-a",
  status: "SUCCEEDED",
  failureCode: null,
  failureMessage: null,
  externalAmountCents: 700,
  surchargeCents: 20,
  chargedTotalCents: 720,
  pointsCents: 200,
  balanceCents: 300,
  couponDiscountCents: 100,
  orderStableId: "order-a",
  orderNumber: "1001",
  pickupCode: "102",
};

describe("POS card payment realtime facts", () => {
  it("allows overlay dismissal only for unresolved original attempts", () => {
    expect(canDismissPosCardPaymentReview("UNKNOWN", true)).toBe(true);
    expect(canDismissPosCardPaymentReview("RECONCILING", true)).toBe(true);
    expect(canDismissPosCardPaymentReview("PROCESSING", true)).toBe(false);
    expect(canDismissPosCardPaymentReview("CANCELLED", true)).toBe(false);
    expect(canDismissPosCardPaymentReview("SUCCEEDED", true)).toBe(false);
    expect(canDismissPosCardPaymentReview("UNKNOWN", false)).toBe(false);
  });

  it("scopes review dismissal to the saved Attempt", () => {
    expect(shouldOpenRestoredPosCardDialog("original", "original", false)).toBe(false);
    expect(shouldOpenRestoredPosCardDialog("next", "original", false)).toBe(true);
    expect(shouldOpenRestoredPosCardDialog("original", null, false)).toBe(true);
    expect(shouldOpenRestoredPosCardDialog("original", null, true)).toBe(false);
    expect(
      needsPosCardPaymentReadback({ ...complete, status: "RECONCILING" }),
    ).toBe(true);
  });

  it("keeps readback active until the original checkout is safely resolved", () => {
    expect(needsPosCardPaymentReadback(null)).toBe(true);
    const unresolvedStatuses = [
      "CREATED", "PROCESSING", "UNKNOWN", "RECONCILING",
    ] as const;
    for (const status of unresolvedStatuses) {
      expect(needsPosCardPaymentReadback({ ...complete, status })).toBe(true);
    }
    expect(needsPosCardPaymentReadback({ ...complete, orderStableId: null })).toBe(true);
    expect(needsPosCardPaymentReadback(complete)).toBe(false);
    expect(needsPosCardPaymentReadback({
      ...complete,
      status: "CANCELLED",
      orderStableId: null,
      benefitsReleaseComplete: false,
    })).toBe(true);
    expect(needsPosCardPaymentReadback({
      ...complete,
      status: "CANCELLED",
      orderStableId: null,
      benefitsReleaseComplete: true,
    })).toBe(false);
    expect(needsPosCardPaymentReadback({ ...complete, status: "DECLINED" })).toBe(false);
    expect(needsPosCardPaymentReadback({ ...complete, status: "FAILED" })).toBe(false);
  });

  it("retains all cents from a complete Socket.IO event", () => {
    expect(parsePosCardPaymentSnapshot({ ...complete, messageKind: "SNAPSHOT" })).toEqual(complete);
  });

  it("does not invent zero-valued amounts from a legacy status-only event", () => {
    expect(parsePosCardPaymentSnapshot({
      attemptId: "attempt-a", paymentId: "payment-a", status: "SUCCEEDED",
      orderStableId: "order-a",
    })).toBeNull();
  });

  it("never treats an external reversal notice as a retryable cancelled payment", () => {
    expect(parsePosCardPaymentSnapshot({
      attemptId: "attempt-a", paymentId: "payment-a", status: "CANCELLED",
      failureCode: "PAYMENT_EXTERNALLY_PARTIALLY_REFUNDED",
      messageKind: "NOTICE",
    })).toBeNull();
  });

  it("rejects malformed amount snapshots", () => {
    expect(parsePosCardPaymentSnapshot({ ...complete, chargedTotalCents: -1 })).toBeNull();
    expect(parsePosCardPaymentSnapshot({ ...complete, surchargeCents: undefined })).toBeNull();
  });

  it("keeps a same-attempt device Retry decision without changing financial finality", () => {
    const declined: PosCardPaymentResult = {
      ...complete,
      status: "DECLINED",
      orderStableId: null,
      customerPromptPending: true,
      customerRetryRequested: false,
    };
    const decision = parsePosCardPaymentSnapshot({
      ...declined,
      messageKind: "SNAPSHOT",
      customerPromptPending: false,
      customerRetryRequested: true,
    });
    expect(decision).not.toBeNull();
    const merged = mergePosCardPaymentSnapshot(declined, decision!);
    expect(merged).toMatchObject({
      status: "DECLINED",
      customerPromptPending: false,
      customerRetryRequested: true,
      orderStableId: null,
    });
    expect(mergePosCardPaymentSnapshot(merged, {
      ...complete,
      status: "PROCESSING",
      orderStableId: null,
    })).toEqual(merged);
    expect(mergePosCardPaymentSnapshot(declined, {
      ...declined,
      customerPromptPending: undefined,
    })?.customerPromptPending).toBe(true);
  });

  it("rejects a delayed HTTP PROCESSING after socket SUCCEEDED", () => {
    expect(mergePosCardPaymentSnapshot(complete, {
      ...complete, status: "PROCESSING", chargedTotalCents: null,
      surchargeCents: null, orderStableId: null,
    })).toEqual(complete);
  });

  it("keeps the device-timeout checkout hint without interpreting it as final cancellation", () => {
    const unresolved: PosCardPaymentResult = {
      ...complete,
      status: "RECONCILING",
      orderStableId: null,
      terminalInteractionTimedOut: true,
    };
    const parsed = parsePosCardPaymentSnapshot({ ...unresolved, messageKind: "SNAPSHOT" });
    expect(parsed).toMatchObject({ status: "RECONCILING", terminalInteractionTimedOut: true });
    expect(mergePosCardPaymentSnapshot(unresolved, { ...unresolved, terminalInteractionTimedOut: undefined })?.terminalInteractionTimedOut).toBe(true);
    expect(mergePosCardPaymentSnapshot(unresolved, { ...unresolved, status: "CANCELLED", terminalInteractionTimedOut: false })?.terminalInteractionTimedOut).toBe(false);
  });

  it("passes an original-504 resume capability through full snapshots and revokes it after claim", () => {
    const unknown: PosCardPaymentResult = {
      ...complete,
      status: "UNKNOWN",
      orderStableId: null,
      canResumeOriginalSale: true,
    };
    expect(parsePosCardPaymentSnapshot({
      ...unknown,
      messageKind: "SNAPSHOT",
    })).toMatchObject({ canResumeOriginalSale: true });
    const claimed = mergePosCardPaymentSnapshot(unknown, {
      ...unknown,
      status: "RECONCILING",
      canResumeOriginalSale: false,
    });
    expect(claimed?.canResumeOriginalSale).toBe(false);
    expect(mergePosCardPaymentSnapshot(unknown, {
      ...unknown,
      status: "RECONCILING",
      canResumeOriginalSale: undefined,
    })?.canResumeOriginalSale).toBe(false);
  });

  it("does not regress RECONCILING to PROCESSING or UNKNOWN", () => {
    const reconciling = { ...complete, status: "RECONCILING" as const, orderStableId: null };
    expect(mergePosCardPaymentSnapshot(reconciling, {
      ...reconciling, status: "PROCESSING",
    })).toEqual(reconciling);
    expect(mergePosCardPaymentSnapshot(reconciling, {
      ...reconciling, status: "UNKNOWN",
    })).toEqual(reconciling);
  });

  it("does not let an older success overwrite a final cancellation", () => {
    const cancelled = { ...complete, status: "CANCELLED" as const, orderStableId: null };
    expect(mergePosCardPaymentSnapshot(cancelled, complete)).toEqual(cancelled);
  });

  it("preserves known surcharge and charged total when a later snapshot has nulls", () => {
    const recovered = mergePosCardPaymentSnapshot({
      ...complete, status: "PROCESSING", orderStableId: null,
    }, {
      ...complete, status: "UNKNOWN", surchargeCents: null,
      chargedTotalCents: null, orderStableId: null,
    });
    expect(recovered?.surchargeCents).toBe(20);
    expect(recovered?.chargedTotalCents).toBe(720);
  });

  it("ignores a result from a different attempt and preserves completed order details", () => {
    expect(mergePosCardPaymentSnapshot(complete, { ...complete, attemptId: "old-attempt" })).toEqual(complete);
    expect(mergePosCardPaymentSnapshot(complete, {
      ...complete, orderStableId: null, pickupCode: null,
    })).toEqual(complete);
  });

  it("unlocks a cancelled checkout only with server-confirmed Benefits RELEASE and safe device recovery", () => {
    const cancelled: PosCardPaymentResult = {
      ...complete,
      status: "CANCELLED",
      orderStableId: null,
      benefitsReleaseComplete: false,
      terminalReadyForNextSale: false,
    };
    expect(canUnlockCancelledPosCheckout(cancelled)).toBe(false);
    // A failed Welcome cannot reverse final cancellation or keep the cash
    // checkout locked; the server-side device fence still rejects a new Sale.
    expect(canUnlockCancelledPosCheckout({
      ...cancelled,
      benefitsReleaseComplete: true,
    })).toBe(true);
    const released = {
      ...cancelled,
      benefitsReleaseComplete: true,
      terminalReadyForNextSale: true,
    };
    expect(canUnlockCancelledPosCheckout(released)).toBe(true);
    expect(canUnlockCancelledPosCheckout({
      ...released,
      status: "UNKNOWN",
    })).toBe(false);
    expect(canUnlockCancelledPosCheckout({
      ...cancelled,
      paymentId: null,
      benefitsReleaseComplete: true,
    })).toBe(true);
  });

  it("continues passive readback for a Sandbox operator-attested FAILED until PEM resolves", () => {
    for (const failureCode of [
      "SANDBOX_OPERATOR_ATTESTED_NO_PAYMENT",
      "POS_SANDBOX_OPERATOR_UNPAID_CLOSED",
      "POS_SANDBOX_OPERATOR_UNPAID_REVIEW_PENDING",
    ]) {
      expect(needsPosCardPaymentReadback({
        ...complete,
        status: "FAILED",
        failureCode,
        orderStableId: null,
      })).toBe(true);
    }
    expect(needsPosCardPaymentReadback({
      ...complete,
      status: "FAILED",
      failureCode: "CLOVER_CARD_DECLINED",
    })).toBe(false);
  });

  it("unlocks only a completed, identity-matched Sandbox PEM unpaid review with all owner checkpoints", () => {
    const review: PosCardPaymentReviewDetail = {
      ...complete,
      status: "FAILED",
      failureCode: "SANDBOX_OPERATOR_ATTESTED_NO_PAYMENT",
      benefitsReleaseComplete: true,
      terminalReadyForNextSale: false, // The ordinary review GET does not expose Fence readiness.
      orderStableId: null,
      currency: "CAD",
      paymentStatus: "FAILED",
      resultCode: "POS_TERMINAL_SANDBOX_OPERATOR_UNPAID",
      externalPaymentId: "sq_original",
      providerPaymentId: null,
      terminalOperationState: "FINALIZED",
      terminalId: "test-terminal",
      sandboxManualRecoveryEnabled: false,
      sandboxOperatorUnpaidAccepted: true,
      sandboxRecoveryTerminalFinalized: true,
      sandboxLateCanonicalPayment: false,
    };
    const exception: PaymentExceptionCase = {
      caseStableId: "pem-original",
      attemptId: review.attemptId,
      storeStableId: "test-store",
      externalPaymentId: "sq_original",
      amountCents: review.externalAmountCents,
      currency: "CAD",
      action: "SANDBOX_CONFIRM_UNPAID",
      mode: "SANDBOX",
      status: "COMPLETED",
      requestedByStableId: "staff-one",
      operatorNote: "Operator reviewed the canonical failed Sale",
      cloverOrderId: "clover-original",
      approvedByStableId: null,
      createdAt: "2026-10-19T00:00:00.000Z",
      updatedAt: "2026-10-19T00:00:00.000Z",
    };
    const safe = (r: PosCardPaymentReviewDetail, c: PaymentExceptionCase | null = exception, store = "test-store") =>
      canUnlockCompletedSandboxUnpaidPosCheckout(r, c, store);

    expect(safe(review)).toBe(true);
    expect(safe(review, null)).toBe(false);
    expect(safe(review, exception, "another-store")).toBe(false);
    for (const mismatch of [
      { status: "NEEDS_REVIEW" as const },
      { action: "RELEASE_CONFIRMED_FAILURE" as const },
      { mode: "PRODUCTION" as const },
      { attemptId: "another-attempt" },
      { externalPaymentId: "sq_another" },
      { storeStableId: "another-store" },
      { amountCents: 1696 },
      { currency: "USD" },
      { cloverOrderId: null },
    ]) {
      expect(safe(review, { ...exception, ...mismatch })).toBe(false);
    }
    const invalidReviews: Partial<PosCardPaymentReviewDetail>[] = [
      { status: "RECONCILING" },
      { paymentStatus: "RECONCILING" },
      { status: "CANCELLED" },
      { resultCode: null },
      { failureCode: "CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED" },
      { benefitsReleaseComplete: false },
      { terminalOperationState: "SALE_IN_FLIGHT" },
      { sandboxOperatorUnpaidAccepted: false },
      { sandboxRecoveryTerminalFinalized: false },
      { sandboxLateCanonicalPayment: true },
      { providerPaymentId: "provider-success" },
      { orderStableId: "paid-order" },
      { externalPaymentId: "sq_another" },
      { currency: "USD" },
      { externalAmountCents: 1696 },
    ];
    for (const mismatch of invalidReviews) {
      expect(safe({ ...review, ...mismatch })).toBe(false);
    }

    // The existing provider-cancelled flow is unchanged.
    expect(canUnlockCancelledPosCheckout(review)).toBe(false);
  });

  it("preserves cancellation checkpoint fields across full WebSocket snapshots", () => {
    const final = parsePosCardPaymentSnapshot({
      ...complete,
      status: "CANCELLED",
      orderStableId: null,
      benefitsReleaseComplete: true,
      terminalReadyForNextSale: true,
      cancellationPending: false,
      messageKind: "SNAPSHOT",
    });
    expect(final).toMatchObject({
      status: "CANCELLED",
      benefitsReleaseComplete: true,
      terminalReadyForNextSale: true,
      cancellationPending: false,
    });
    const partial = mergePosCardPaymentSnapshot(final, {
      ...final!,
      benefitsReleaseComplete: undefined,
      terminalReadyForNextSale: undefined,
    });
    expect(partial?.benefitsReleaseComplete).toBe(true);
    expect(partial?.terminalReadyForNextSale).toBe(true);
  });
});
