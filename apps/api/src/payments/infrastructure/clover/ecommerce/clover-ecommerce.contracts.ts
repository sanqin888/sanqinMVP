export type CloverEcommercePaymentCreateResult =
  | { ok: true; paymentId: string; status?: string }
  | {
      ok: false;
      reason: string;
      status?: string;
      code?: string;
      challengeUrl?: string | null;
      paymentId?: string;
    };

export type CloverEcommerceChargeStatusResult =
  | {
      ok: true;
      paymentId?: string;
      externalPaymentId?: string;
      status?: string;
      captured?: boolean;
      currency?: string;
      baseAmountCents?: number;
      chargedTotalCents?: number;
      creditSurchargeCents?: number;
      creditSurchargeRate?: number;
    }
  | {
      ok: false;
      reason: string;
      status?: string;
      code?: string;
      message?: string;
    };

export type CloverEcommerceCreateChargeRequest = {
  amountCents: number;
  currency: string;
  source: string;
  orderId: string;
  externalPaymentId?: string;
  idempotencyKey?: string;
  description?: string;
};

export type CloverEcommerceGetChargeStatusRequest = {
  externalPaymentId?: string;
  paymentId?: string;
  idempotencyKey?: string;
};
