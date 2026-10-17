import type {
  PosCardPaymentActiveReviewItem,
  PosCardPaymentReviewItem,
} from "@/lib/api/pos";
import { partitionPosCardPaymentReviewQueues } from "./pos-card-payment-review-queues";

const active = (
  attemptId: string,
): PosCardPaymentActiveReviewItem => ({
  attemptId,
  checkoutStatus: "RECONCILING",
  externalAmountCents: 1695,
  currency: "CAD",
  createdAt: "2026-10-17T20:28:00.000Z",
  updatedAt: "2026-10-17T20:29:00.000Z",
});
const historic = (attemptId: string): PosCardPaymentReviewItem => ({
  attemptId,
  checkoutStatus: "RECONCILING",
  reviewReason: "LONG_WAIT",
  preparedExpiresAt: "2026-10-17T20:30:00.000Z",
  updatedAt: "2026-10-17T20:31:00.000Z",
  pointsCents: 100,
  balanceCents: 0,
  couponDiscountCents: 0,
});

describe("Store POS card review queues", () => {
  it("shows another device's unexpired attempt without any local pending ID", () => {
    const result = partitionPosCardPaymentReviewQueues(
      [active("other-device")],
      [],
      null,
    );
    expect(result.activeItems.map((item) => item.attemptId)).toEqual([
      "other-device",
    ]);
  });

  it("pins the local original separately and removes both cross-queue duplicates", () => {
    const result = partitionPosCardPaymentReviewQueues(
      [active("local"), active("remote")],
      [historic("local"), historic("remote"), historic("older")],
      "local",
    );
    expect(result.activeItems.map((item) => item.attemptId)).toEqual(["remote"]);
    expect(result.historicalItems.map((item) => item.attemptId)).toEqual([
      "older",
    ]);
  });

  it("keeps historic rows even if not in the latest ten unresolved", () => {
    const result = partitionPosCardPaymentReviewQueues(
      [active("recent")],
      [historic("old-unresolved"), historic("released-pending")],
      null,
    );
    expect(result.historicalItems).toHaveLength(2);
  });

  it("does not mutate server response arrays", () => {
    const recent = [active("one")];
    const historical = [historic("one"), historic("two")];
    partitionPosCardPaymentReviewQueues(recent, historical, null);
    expect(recent).toHaveLength(1);
    expect(historical).toHaveLength(2);
  });
});
