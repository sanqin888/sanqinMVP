import type { ConditionalPaymentSaveResult } from './payment-transaction.repository';
import type { PaymentTransaction } from '../domain/payment-transaction';

export interface PaymentReverseSyncPersistence {
  saveSuccessfulSaleObservation(
    transaction: PaymentTransaction,
  ): Promise<ConditionalPaymentSaveResult>;
}

export const PAYMENT_REVERSE_SYNC_PERSISTENCE = Symbol(
  'PAYMENT_REVERSE_SYNC_PERSISTENCE',
);
