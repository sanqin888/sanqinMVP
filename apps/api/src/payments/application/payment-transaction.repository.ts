import type { PaymentTransaction } from '../domain/payment-transaction';

export type PaymentTransactionUniqueField =
  | 'attemptId'
  | 'idempotencyKey'
  | 'externalPaymentId';

export class PaymentTransactionUniquenessError extends Error {
  constructor(readonly field: PaymentTransactionUniqueField) {
    super(`Payment transaction ${field} must be unique`);
    this.name = 'PaymentTransactionUniquenessError';
  }
}

export interface PaymentTransactionRepository {
  findById(id: string): Promise<PaymentTransaction | null>;
  findByAttemptId(attemptId: string): Promise<PaymentTransaction | null>;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentTransaction | null>;
  create(transaction: PaymentTransaction): Promise<PaymentTransaction>;
  save(transaction: PaymentTransaction): Promise<PaymentTransaction>;
}

export const PAYMENT_TRANSACTION_REPOSITORY = Symbol(
  'PAYMENT_TRANSACTION_REPOSITORY',
);
