import type { PaymentMethod } from '@shared/order';

import type { PosOrderDto } from '../orders/public-api';

export const POS_FULL_REFUND_MANAGEMENT = Symbol('POS_FULL_REFUND_MANAGEMENT');

export type PosFullRefundManagementInput = {
  reason: string;
  operatorName: string;
  refundAmountCents: number;
  originalPaymentMethod: PaymentMethod;
  refundMethod: PaymentMethod;
};

export type PosFullRefundManagementResult = {
  order: PosOrderDto;
  outcome: 'pending_platform' | 'pending_manual' | 'refunded';
};

export interface PosFullRefundManagementPort {
  createFullRefund(
    storeStableId: string,
    orderStableId: string,
    input: PosFullRefundManagementInput,
  ): Promise<PosFullRefundManagementResult>;
}
