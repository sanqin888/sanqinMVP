import { createHash, randomUUID } from 'node:crypto';

import {
  PaymentTransaction,
  type CreatePaymentTransactionInput,
} from '../domain/payment-transaction';
import type { PaymentProviderOutcome } from '../domain/payment.types';
import type {
  PaymentProvider,
  PaymentTerminalAvailability,
  PaymentTerminalProvider,
} from './payment-provider.port';
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

export type StartTerminalSaleInput = {
  attemptId: string;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  description?: string | null;
};

export class PaymentTransactionNotFoundError extends Error {
  constructor(paymentId: string) {
    super(`Payment transaction not found: ${paymentId}`);
    this.name = 'PaymentTransactionNotFoundError';
  }
}

export class InvalidTerminalPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTerminalPaymentError';
  }
}

const terminalExternalPaymentId = (attemptId: string): string =>
  `sq_${createHash('sha256').update(attemptId).digest('hex').slice(0, 29)}`;

const providerCallUnknown = (
  code: string,
  message: string,
): PaymentProviderOutcome => ({
  status: 'UNKNOWN',
  failureCode: code,
  failureMessage: message,
});

export class TerminalPaymentService {
  constructor(
    private readonly createAttempt: CreatePaymentAttemptUseCase,
    private readonly transactions: PaymentTransactionRepository,
    private readonly provider: PaymentProvider,
    private readonly terminalProvider: PaymentTerminalProvider,
  ) {}

  async getAvailability(): Promise<PaymentTerminalAvailability> {
    try {
      return await this.terminalProvider.getAvailability();
    } catch (error) {
      return {
        state: 'UNKNOWN',
        configured: true,
        available: false,
        failureCode: 'TERMINAL_AVAILABILITY_QUERY_FAILED',
        failureMessage: this.errorMessage(
          error,
          'Terminal availability query failed',
        ),
      };
    }
  }

  async startSale(input: StartTerminalSaleInput): Promise<PaymentTransaction> {
    const transaction = await this.createAttempt.execute({
      attemptId: input.attemptId,
      idempotencyKey: input.idempotencyKey,
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: input.amountCents,
      currency: input.currency,
      externalPaymentId: terminalExternalPaymentId(input.attemptId),
    });

    if (transaction.status !== 'CREATED') return transaction;

    const processing = transaction.transitionTo('PROCESSING');
    const claimed = await this.transactions.saveIfCurrentStatus(
      processing,
      'CREATED',
    );
    if (!claimed.updated) return claimed.transaction;

    const snapshot = claimed.transaction.toSnapshot();
    let outcome: PaymentProviderOutcome;
    try {
      outcome = await this.provider.startPayment({
        paymentId: snapshot.id,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
        paymentMethod: snapshot.paymentMethod,
        source: snapshot.source,
        idempotencyKey: snapshot.idempotencyKey,
        externalPaymentId: snapshot.externalPaymentId,
        description: input.description,
      });
    } catch (error) {
      outcome = providerCallUnknown(
        'TERMINAL_PAYMENT_REQUEST_UNCERTAIN',
        this.errorMessage(error, 'Terminal payment request outcome is uncertain'),
      );
    }

    return this.persistProcessingOutcome(claimed.transaction, outcome);
  }

  async findById(paymentId: string): Promise<PaymentTransaction> {
    return this.requireTransaction(paymentId);
  }

  async cancel(paymentId: string): Promise<PaymentTransaction> {
    let transaction = await this.requireTerminalSale(paymentId);
    if (transaction.status === 'CREATED') {
      const cancelled = transaction.transitionTo('CANCELLED');
      const localCancel = await this.transactions.saveIfCurrentStatus(
        cancelled,
        'CREATED',
      );
      if (localCancel.updated) return localCancel.transaction;
      transaction = localCancel.transaction;
    }

    if (transaction.status !== 'PROCESSING') return transaction;

    const snapshot = transaction.toSnapshot();
    let outcome: PaymentProviderOutcome;
    try {
      outcome = await this.provider.cancelPayment({
        paymentId: snapshot.id,
        source: snapshot.source,
        idempotencyKey: snapshot.idempotencyKey,
        externalPaymentId: snapshot.externalPaymentId,
        providerPaymentId: snapshot.providerPaymentId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
      });
    } catch (error) {
      outcome = providerCallUnknown(
        'TERMINAL_CANCEL_REQUEST_UNCERTAIN',
        this.errorMessage(error, 'Terminal cancel request outcome is uncertain'),
      );
    }

    outcome = {
      ...outcome,
      status: 'UNKNOWN',
      failureCode:
        outcome.failureCode ?? 'TERMINAL_CANCEL_REQUIRES_RECONCILIATION',
      failureMessage:
        outcome.failureMessage ??
        'Terminal cancel requires reconciliation before final payment truth',
    };

    return this.persistProcessingOutcome(transaction, outcome);
  }

  async reconcile(paymentId: string): Promise<PaymentTransaction> {
    let transaction = await this.requireTerminalSale(paymentId);
    if (this.isFinal(transaction)) return transaction;
    if (transaction.status === 'CREATED') return transaction;

    if (transaction.status === 'PROCESSING') {
      const unknown = transaction.applyProviderOutcome({
        status: 'UNKNOWN',
        failureCode: 'TERMINAL_PAYMENT_RECOVERY_REQUIRED',
        failureMessage: 'Recovering payment truth after an interrupted request',
      });
      const moved = await this.transactions.saveIfCurrentStatus(
        unknown,
        'PROCESSING',
      );
      transaction = moved.transaction;
      if (this.isFinal(transaction)) return transaction;
    }

    if (transaction.status === 'UNKNOWN') {
      const reconciling = transaction.transitionTo('RECONCILING');
      const moved = await this.transactions.saveIfCurrentStatus(
        reconciling,
        'UNKNOWN',
      );
      transaction = moved.transaction;
      if (this.isFinal(transaction)) return transaction;
    }

    if (transaction.status !== 'RECONCILING') return transaction;

    const snapshot = transaction.toSnapshot();
    let outcome: PaymentProviderOutcome;
    try {
      outcome = await this.provider.getPaymentStatus({
        paymentId: snapshot.id,
        source: snapshot.source,
        idempotencyKey: snapshot.idempotencyKey,
        externalPaymentId: snapshot.externalPaymentId,
        providerPaymentId: snapshot.providerPaymentId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
      });
    } catch (error) {
      outcome = providerCallUnknown(
        'TERMINAL_RECONCILIATION_QUERY_FAILED',
        this.errorMessage(error, 'Terminal reconciliation query failed'),
      );
    }

    if (outcome.status === 'UNKNOWN' || outcome.status === 'PROCESSING') {
      const observed = transaction.recordProviderObservation(outcome);
      return (
        await this.transactions.saveIfCurrentStatus(observed, 'RECONCILING')
      ).transaction;
    }

    const resolved = transaction.applyProviderOutcome(outcome);
    return (
      await this.transactions.saveIfCurrentStatus(resolved, 'RECONCILING')
    ).transaction;
  }

  private async persistProcessingOutcome(
    transaction: PaymentTransaction,
    outcome: PaymentProviderOutcome,
  ): Promise<PaymentTransaction> {
    if (outcome.status === 'PROCESSING') {
      const observed = transaction.recordProviderObservation(outcome);
      return (
        await this.transactions.saveIfCurrentStatus(observed, 'PROCESSING')
      ).transaction;
    }

    const settled = transaction.applyProviderOutcome(outcome);
    return (
      await this.transactions.saveIfCurrentStatus(settled, 'PROCESSING')
    ).transaction;
  }

  private async requireTransaction(
    paymentId: string,
  ): Promise<PaymentTransaction> {
    const transaction = await this.transactions.findById(paymentId);
    if (!transaction) throw new PaymentTransactionNotFoundError(paymentId);
    return transaction;
  }

  private async requireTerminalSale(
    paymentId: string,
  ): Promise<PaymentTransaction> {
    const transaction = await this.requireTransaction(paymentId);
    const snapshot = transaction.toSnapshot();
    if (
      snapshot.provider !== 'CLOVER' ||
      snapshot.source !== 'POS_TERMINAL' ||
      snapshot.operation !== 'SALE' ||
      snapshot.paymentMethod !== 'CARD'
    ) {
      throw new InvalidTerminalPaymentError(
        `Payment transaction ${paymentId} is not a Clover Terminal card sale`,
      );
    }
    return transaction;
  }

  private isFinal(transaction: PaymentTransaction): boolean {
    return ['SUCCEEDED', 'DECLINED', 'CANCELLED', 'FAILED'].includes(
      transaction.status,
    );
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim()
      ? error.message
      : fallback;
  }
}
