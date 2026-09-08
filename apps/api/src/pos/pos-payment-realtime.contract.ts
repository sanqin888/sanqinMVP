export const POS_PAYMENT_REALTIME = Symbol('POS_PAYMENT_REALTIME');

export type PosCardPaymentStatusRealtimeMessage = {
  attemptId: string;
  paymentId: string | null;
  status: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  orderStableId?: string | null;
  orderNumber?: string | null;
  pickupCode?: string | null;
};

export type PosCardPaymentReverseSyncRealtimeMessage = {
  attemptId: string;
  paymentId: string;
  externalReversal: 'PARTIAL_REFUND' | 'FULL_REFUND' | 'VOID';
  refundedAmountCents: number;
  orderStableId?: string | null;
  orderStatus?: string | null;
  requiresManualReview?: boolean;
};

export interface PosPaymentRealtimePort {
  publishCardPaymentStatus(
    storeStableId: string,
    data: PosCardPaymentStatusRealtimeMessage,
  ): void;
  publishCardPaymentReverseSync(
    storeStableId: string,
    data: PosCardPaymentReverseSyncRealtimeMessage,
  ): void;
}
