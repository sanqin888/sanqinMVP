import { createHash, randomUUID } from 'node:crypto';

import {
  PaymentTransaction,
  type CreatePaymentTransactionInput,
} from '../domain/payment-transaction';
import type {
  PaymentProviderOutcome,
  PaymentStatus,
} from '../domain/payment.types';
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

export class PaymentProviderCorrelationConflictError extends Error {
  constructor(paymentId: string, details: readonly string[]) {
    super(
      `Payment provider correlation conflict for ${paymentId}: ${details.join(', ')}`,
    );
    this.name = 'PaymentProviderCorrelationConflictError';
  }
}

export class PaymentFinalStateConflictError extends Error {
  constructor(
    paymentId: string,
    currentStatus: PaymentStatus,
    incomingStatus: PaymentStatus,
  ) {
    super(
      `Conflicting final payment result for ${paymentId}: existing=${currentStatus} incoming=${incomingStatus}`,
    );
    this.name = 'PaymentFinalStateConflictError';
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
        attemptId: snapshot.attemptId,
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
        this.errorMessage(
          error,
          'Terminal payment request outcome is uncertain',
        ),
      );
    }

    return this.mergeProviderOutcome(claimed.transaction.id, outcome);
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
        attemptId: snapshot.attemptId,
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
        this.errorMessage(
          error,
          'Terminal cancel request outcome is uncertain',
        ),
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

    return this.mergeProviderOutcome(transaction.id, outcome);
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
        attemptId: snapshot.attemptId,
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

    return this.mergeProviderOutcome(transaction.id, outcome);
  }

  private async mergeProviderOutcome(
    paymentId: string,
    outcome: PaymentProviderOutcome,
  ): Promise<PaymentTransaction> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.requireTerminalSale(paymentId);
      const currentStatus = current.status;
      const correlationProblems = this.correlationProblems(current, outcome);

      if (this.isFinal(current)) {
        const finalCanonicalProblems =
          this.isFinalStatus(outcome.status) &&
          (outcome.status === 'SUCCEEDED' || outcome.evidence === 'CANONICAL')
            ? this.canonicalEvidenceProblems(current, outcome)
            : [];
        const finalProblems = [
          ...new Set([...correlationProblems, ...finalCanonicalProblems]),
        ];
        if (finalProblems.length > 0) {
          throw new PaymentProviderCorrelationConflictError(
            paymentId,
            finalProblems,
          );
        }
        if (!this.isFinalStatus(outcome.status)) return current;
        if (currentStatus === outcome.status) return current;
        throw new PaymentFinalStateConflictError(
          paymentId,
          currentStatus,
          outcome.status,
        );
      }

      if (currentStatus === 'CREATED') {
        throw new InvalidTerminalPaymentError(
          `Cannot merge provider outcome while payment ${paymentId} is CREATED`,
        );
      }

      const requiresCanonicalFinal =
        this.isFinalStatus(outcome.status) &&
        (outcome.status === 'SUCCEEDED' ||
          currentStatus === 'UNKNOWN' ||
          currentStatus === 'RECONCILING');
      const canonicalProblems = requiresCanonicalFinal
        ? this.canonicalEvidenceProblems(current, outcome)
        : [];
      const problems = [
        ...new Set([...correlationProblems, ...canonicalProblems]),
      ];

      let next: PaymentTransaction;
      if (problems.length > 0) {
        next = this.correlationConflictObservation(current, problems);
      } else if (
        outcome.status === 'PROCESSING' ||
        (outcome.status === 'UNKNOWN' &&
          (currentStatus === 'UNKNOWN' || currentStatus === 'RECONCILING'))
      ) {
        next = current.recordProviderObservation(outcome);
      } else {
        next = current.applyProviderOutcome(outcome);
      }

      const saved = await this.transactions.saveIfCurrentStatus(
        next,
        currentStatus,
      );
      if (saved.updated) return saved.transaction;
    }

    throw new PaymentAttemptConflictError(
      `Payment outcome merge did not converge for ${paymentId}`,
    );
  }

  private correlationProblems(
    transaction: PaymentTransaction,
    outcome: PaymentProviderOutcome,
  ): string[] {
    const snapshot = transaction.toSnapshot();
    const problems: string[] = [];
    if (outcome.paymentId !== undefined && outcome.paymentId !== snapshot.id) {
      problems.push('internal payment id mismatch');
    }
    if (
      outcome.attemptId !== undefined &&
      outcome.attemptId !== snapshot.attemptId
    ) {
      problems.push('attemptId mismatch');
    }
    if (
      outcome.idempotencyKey !== undefined &&
      outcome.idempotencyKey !== snapshot.idempotencyKey
    ) {
      problems.push('idempotency identity mismatch');
    }
    if (
      outcome.externalPaymentId !== undefined &&
      outcome.externalPaymentId !== null &&
      snapshot.externalPaymentId !== null &&
      outcome.externalPaymentId !== snapshot.externalPaymentId
    ) {
      problems.push('externalPaymentId mismatch');
    }
    if (
      outcome.providerPaymentId !== undefined &&
      outcome.providerPaymentId !== null &&
      snapshot.providerPaymentId !== null &&
      outcome.providerPaymentId !== snapshot.providerPaymentId
    ) {
      problems.push('providerPaymentId mismatch');
    }
    if (
      outcome.amountCents !== undefined &&
      outcome.amountCents !== snapshot.amountCents
    ) {
      problems.push('amount mismatch');
    }
    if (
      outcome.currency !== undefined &&
      outcome.currency.toUpperCase() !== snapshot.currency
    ) {
      problems.push('currency mismatch');
    }
    return problems;
  }

  private canonicalEvidenceProblems(
    transaction: PaymentTransaction,
    outcome: PaymentProviderOutcome,
  ): string[] {
    const snapshot = transaction.toSnapshot();
    const problems: string[] = [];
    if (outcome.evidence !== 'CANONICAL') {
      problems.push('canonical provider evidence missing');
    }
    if (outcome.paymentId !== snapshot.id) {
      problems.push('canonical internal payment id missing or mismatched');
    }
    if (outcome.attemptId !== snapshot.attemptId) {
      problems.push('canonical attemptId missing or mismatched');
    }
    if (outcome.idempotencyKey !== snapshot.idempotencyKey) {
      problems.push('canonical idempotency identity missing or mismatched');
    }
    if (
      !snapshot.externalPaymentId ||
      outcome.externalPaymentId !== snapshot.externalPaymentId
    ) {
      problems.push('canonical externalPaymentId missing or mismatched');
    }
    if (!outcome.providerPaymentId) {
      problems.push('canonical providerPaymentId missing');
    } else if (
      snapshot.providerPaymentId &&
      outcome.providerPaymentId !== snapshot.providerPaymentId
    ) {
      problems.push('canonical providerPaymentId mismatched');
    }
    if (outcome.amountCents !== snapshot.amountCents) {
      problems.push('canonical amount missing or mismatched');
    }
    if (outcome.currency?.toUpperCase() !== snapshot.currency) {
      problems.push('canonical currency missing or mismatched');
    }
    return problems;
  }

  private correlationConflictObservation(
    transaction: PaymentTransaction,
    problems: readonly string[],
  ): PaymentTransaction {
    const outcome: PaymentProviderOutcome = {
      status: 'UNKNOWN',
      failureCode: 'PAYMENT_PROVIDER_CORRELATION_MISMATCH',
      failureMessage: `Provider observation was not merged: ${problems.join(', ')}`,
    };
    if (transaction.status === 'PROCESSING') {
      return transaction.applyProviderOutcome(outcome);
    }
    return transaction.recordProviderObservation(outcome);
  }

  private isFinalStatus(status: PaymentStatus): boolean {
    return ['SUCCEEDED', 'DECLINED', 'CANCELLED', 'FAILED'].includes(status);
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
