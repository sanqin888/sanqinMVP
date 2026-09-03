export const PAYMENT_TENDER_RESERVATION = Symbol(
  'PAYMENT_TENDER_RESERVATION',
);
export const PAYMENT_COUPON_RESERVATION = Symbol(
  'PAYMENT_COUPON_RESERVATION',
);

export type HoldPaymentTenderReservationInput = {
  attemptId: string;
  userStableId?: string;
  pointsValueCents: number;
  balanceCents: number;
  expiresAt: Date;
};

export interface PaymentTenderReservationPort {
  holdPaymentTender(input: HoldPaymentTenderReservationInput): Promise<void>;
  releasePaymentTender(attemptId: string): Promise<void>;
}

export type HoldPaymentCouponReservationInput = {
  attemptId: string;
  userStableId?: string;
  couponStableId?: string;
  selectedUserCouponId?: string;
  expiresAt: Date;
};

export interface PaymentCouponReservationPort {
  holdPaymentCoupons(input: HoldPaymentCouponReservationInput): Promise<void>;
  releasePaymentCoupons(attemptId: string): Promise<void>;
}
