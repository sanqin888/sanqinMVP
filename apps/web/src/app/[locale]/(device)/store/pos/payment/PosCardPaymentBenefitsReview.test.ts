import { shouldWarnUnresolvedCardReview } from "./PosCardPaymentBenefitsReview";

describe("POS original-payment review warning", () => {
  it.each(["CREATED", "PROCESSING", "UNKNOWN", "RECONCILING"] as const)(
    "warns while payment status is %s",
    (paymentStatus) => {
      expect(
        shouldWarnUnresolvedCardReview({ status: paymentStatus, paymentStatus }),
      ).toBe(true);
    },
  );

  it.each(["SUCCEEDED", "DECLINED", "CANCELLED", "FAILED"] as const)(
    "does not warn for a final %s payment",
    (paymentStatus) => {
      expect(
        shouldWarnUnresolvedCardReview({
          status: "RECONCILING",
          paymentStatus,
        }),
      ).toBe(false);
    },
  );

  it("uses the checkout status when a payment record is unavailable", () => {
    expect(
      shouldWarnUnresolvedCardReview({
        status: "RECONCILING",
        paymentStatus: null,
      }),
    ).toBe(true);
    expect(
      shouldWarnUnresolvedCardReview({
        status: "CANCELLED",
        paymentStatus: null,
      }),
    ).toBe(false);
  });

  it("does not warn for an already successful reviewed Attempt", () => {
    expect(
      shouldWarnUnresolvedCardReview({
        status: "SUCCEEDED",
        paymentStatus: "SUCCEEDED",
      }),
    ).toBe(false);
  });
});
