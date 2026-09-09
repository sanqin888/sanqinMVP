import type { PreparedPaymentOrderSnapshot } from './payment-order-preparation.contract';

export const PAYMENT_ORDER_FINALIZATION = Symbol('PAYMENT_ORDER_FINALIZATION');

export type ConfirmedPaymentOrderView = {
  orderStableId: string;
  orderNumber: string;
  pickupCode: string | null;
};

export type ConfirmedPaymentFinalizationInput = {
  attemptId: string;
  orderStableId: string;
  cardSurchargeCents: number;
  chargedTotalCents: number;
};

export type ConfirmedPaymentOrderResult = {
  order: ConfirmedPaymentOrderView;
};

export interface PaymentOrderFinalizationPort {
  finalizeConfirmedPayment(
    snapshot: PreparedPaymentOrderSnapshot,
    input: ConfirmedPaymentFinalizationInput,
  ): Promise<ConfirmedPaymentOrderResult>;
}
