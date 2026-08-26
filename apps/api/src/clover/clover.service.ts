import { Injectable } from '@nestjs/common';

import type {
  CloverEcommerceChargeStatusResult,
  CloverEcommerceCreateChargeRequest,
  CloverEcommerceGetChargeStatusRequest,
  CloverEcommercePaymentCreateResult,
} from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.contracts';
import { CloverEcommerceTransport } from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.transport';

export type CloverChargeStatusResult = CloverEcommerceChargeStatusResult;
export type CloverPaymentCreateResult = CloverEcommercePaymentCreateResult;
export { toChargeStatusSuccess } from '../payments/infrastructure/clover/ecommerce/clover-ecommerce.mapper';

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
    params: CloverEcommerceCreateChargeRequest,
  ): Promise<CloverEcommercePaymentCreateResult> {
    return this.ecommerce.createCardPayment(params);
  }

  getChargeStatus(
    params: CloverEcommerceGetChargeStatusRequest,
  ): Promise<CloverEcommerceChargeStatusResult> {
    return this.ecommerce.getChargeStatus(params);
  }
}
