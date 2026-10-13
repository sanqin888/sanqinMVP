import type { PosCardPaymentResult } from "./api/pos";
import {
  mergePosCardPaymentSnapshot,
  parsePosCardPaymentSnapshot,
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
});
