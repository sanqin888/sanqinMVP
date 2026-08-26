import { Injectable } from '@nestjs/common';

import { CloverEcommerceTransport } from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.transport';

export type CloverPaymentCreateResult =
  | { ok: true; paymentId: string; status?: string }
  | {
      ok: false;
      reason: string;
      status?: string;
      code?: string;
      challengeUrl?: string | null;
      paymentId?: string;
    };

export type CloverChargeStatusResult =
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

type CloverCreateChargeRequest = {
  amountCents: number;
  currency: string;
  source: string;
  orderId: string;
  externalPaymentId?: string;
  idempotencyKey?: string;
  description?: string;
};

type CloverGetChargeStatusRequest = {
  externalPaymentId?: string;
  paymentId?: string;
  idempotencyKey?: string;
};

/**
 * Compatibility facade for the existing Web checkout flow.
 *
 * Phase B moves provider transport and wire mapping into Payments infrastructure
 * without changing the public behavior consumed by CloverPayController. New
 * payment application code must depend on PaymentProvider instead of this facade.
 */
@Injectable()
export class CloverService {
  constructor(private readonly ecommerce: CloverEcommerceTransport) {}

  createCardPayment(
    params: CloverCreateChargeRequest,
  ): Promise<CloverPaymentCreateResult> {
    return this.ecommerce.createCardPayment(params);
  }

  getChargeStatus(
    params: CloverGetChargeStatusRequest,
  ): Promise<CloverChargeStatusResult> {
    return this.ecommerce.getChargeStatus(params);
  }
}
