import { randomUUID } from 'node:crypto';

import {
  PaymentTransaction,
  type CreatePaymentTransactionInput,
} from '../domain/payment-transaction';
import {
  PaymentTransactionUniquenessError,
  type PaymentTransactionRepository,
} from './payment-transaction.repository';

export type CreatePaymentAttemptInput = Omit<
  CreatePaymentTransactionInput,
  'id'
>;

export class PaymentAttemptConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentAttemptConflictError';
  }
}

export class CreatePaymentAttemptUseCase {
  constructor(private readonly transactions: PaymentTransactionRepository) {}

  async execute(input: CreatePaymentAttemptInput): Promise<PaymentTransaction> {
    const existingByAttempt = await this.transactions.findByAttemptId(
      input.attemptId,
    );
    if (existingByAttempt) {
      return this.requireSameAttempt(existingByAttempt, input);
    }

    const existingByIdempotency = await this.transactions.findByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existingByIdempotency) {
      return this.requireSameAttempt(existingByIdempotency, input);
    }

    const transaction = PaymentTransaction.create({
      ...input,
      id: randomUUID(),
    });

    try {
      return await this.transactions.create(transaction);
    } catch (error) {
      if (!(error instanceof PaymentTransactionUniquenessError)) throw error;

      if (error.field === 'externalPaymentId') throw error;

      const winner =
        error.field === 'attemptId'
          ? await this.transactions.findByAttemptId(input.attemptId)
          : await this.transactions.findByIdempotencyKey(input.idempotencyKey);
      if (winner) return this.requireSameAttempt(winner, input);
      throw error;
    }
  }

  private requireSameAttempt(
    existing: PaymentTransaction,
    input: CreatePaymentAttemptInput,
  ): PaymentTransaction {
    const snapshot = existing.toSnapshot();
    const sameAttempt =
      snapshot.attemptId === input.attemptId &&
      snapshot.idempotencyKey === input.idempotencyKey &&
      (input.orderId === undefined ||
        input.orderId === null ||
        snapshot.orderId === input.orderId) &&
      (input.checkoutIntentId === undefined ||
        input.checkoutIntentId === null ||
        snapshot.checkoutIntentId === input.checkoutIntentId) &&
      snapshot.provider === input.provider &&
      snapshot.source === input.source &&
      snapshot.paymentMethod === input.paymentMethod &&
      snapshot.operation === input.operation &&
      snapshot.amountCents === input.amountCents &&
      snapshot.currency === input.currency &&
      (input.externalPaymentId === undefined ||
        input.externalPaymentId === null ||
        snapshot.externalPaymentId === input.externalPaymentId);

    if (!sameAttempt) {
      throw new PaymentAttemptConflictError(
        'Payment attempt identity was reused with different immutable payment facts',
      );
    }
    return existing;
  }
}
