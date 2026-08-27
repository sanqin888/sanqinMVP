import type { PaymentTransaction } from '../domain/payment-transaction';
import type {
  PaymentOperation,
  PaymentProviderOutcome,
  PaymentStatus,
} from '../domain/payment.types';
import type { PaymentProvider } from './payment-provider.port';
import type { PaymentTransactionRepository } from './payment-transaction.repository';
import {
  CreatePaymentAttemptUseCase,
  PaymentAttemptConflictError,
  PaymentFinalStateConflictError,
  PaymentProviderCorrelationConflictError,
} from './create-payment-attempt.use-case';

export type StartOrRecoverRefundInput = {
  attemptId: string;
  idempotencyKey: string;
  orderId: string;
  originalPaymentId: string;
  operation: Extract<PaymentOperation, 'REFUND' | 'VOID'>;
  amountCents: number;
  currency: string;
  originalProviderPaymentId: string;
  expectedAdditionalChargeRefundCents: number;
};

export class InvalidPaymentReversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentReversalError';
  }
}

export class PaymentReversalPreflightError extends Error {
  constructor(
    readonly failureCode: string,
    readonly failureMessage: string,
  ) {
    super(failureMessage);
    this.name = 'PaymentReversalPreflightError';
  }
}

export class RefundPaymentService {
  constructor(
    private readonly createAttempt: CreatePaymentAttemptUseCase,
    private readonly transactions: PaymentTransactionRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async startOrRecover(
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    let transaction = await this.transactions.findByAttemptId(input.attemptId);
    if (!transaction) {
      await this.refreshOriginalSaleBeforeReversal(input);
      transaction = await this.createAttempt.execute({
        attemptId: input.attemptId,
        idempotencyKey: input.idempotencyKey,
        orderId: input.orderId,
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: input.operation,
        amountCents: input.amountCents,
        currency: input.currency,
      });
    }
    this.assertReversal(transaction, input);
    if (this.isFinal(transaction.status)) {
      return this.recordOriginalSaleReversal(transaction, input);
    }

    if (transaction.status === 'CREATED') {
      const processing = transaction.transitionTo('PROCESSING');
      const claimed = await this.transactions.saveIfCurrentStatus(
        processing,
        'CREATED',
      );
      transaction = claimed.transaction;
      if (claimed.updated) {
        const executed = await this.executeReversal(transaction, input);
        return this.recordOriginalSaleReversal(executed, input);
      }
    }

    const reconciled = await this.reconcile(transaction, input);
    return this.recordOriginalSaleReversal(reconciled, input);
  }

  private async executeReversal(
    transaction: PaymentTransaction,
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    const request = this.providerRequest(transaction, input);
    let outcome: PaymentProviderOutcome;
    try {
      outcome =
        input.operation === 'VOID'
          ? await this.provider.voidPayment(request)
          : await this.provider.refundPayment({
              ...request,
              amountCents: input.amountCents,
            });
    } catch (error) {
      outcome = {
        status: 'UNKNOWN',
        providerPaymentId: input.originalProviderPaymentId,
        failureCode: `CLOVER_${input.operation}_REQUEST_UNCERTAIN`,
        failureMessage: this.errorMessage(
          error,
          `Clover ${input.operation.toLowerCase()} request outcome is uncertain`,
        ),
      };
    }
    return this.mergeProviderOutcome(transaction.id, input, outcome);
  }

  private async reconcile(
    initial: PaymentTransaction,
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    let transaction = initial;
    if (this.isFinal(transaction.status)) return transaction;

    if (transaction.status === 'PROCESSING') {
      const unknown = transaction.applyProviderOutcome({
        status: 'UNKNOWN',
        providerPaymentId: input.originalProviderPaymentId,
        failureCode: 'PAYMENT_REVERSAL_RECOVERY_REQUIRED',
        failureMessage:
          'Recovering reversal truth after an interrupted or concurrent provider request',
      });
      const moved = await this.transactions.saveIfCurrentStatus(
        unknown,
        'PROCESSING',
      );
      transaction = moved.transaction;
      if (this.isFinal(transaction.status)) return transaction;
    }

    if (transaction.status === 'UNKNOWN') {
      const reconciling = transaction.transitionTo('RECONCILING');
      const moved = await this.transactions.saveIfCurrentStatus(
        reconciling,
        'UNKNOWN',
      );
      transaction = moved.transaction;
      if (this.isFinal(transaction.status)) return transaction;
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
        operation: snapshot.operation,
        providerPaymentId: input.originalProviderPaymentId,
        providerRefundId: snapshot.providerRefundId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
        expectedAdditionalChargeRefundCents:
          input.expectedAdditionalChargeRefundCents,
      });
    } catch (error) {
      outcome = {
        status: 'UNKNOWN',
        evidence: 'CANONICAL',
        paymentId: snapshot.id,
        attemptId: snapshot.attemptId,
        idempotencyKey: snapshot.idempotencyKey,
        providerPaymentId: input.originalProviderPaymentId,
        providerRefundId: snapshot.providerRefundId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
        failureCode: 'PAYMENT_REVERSAL_RECONCILIATION_QUERY_FAILED',
        failureMessage: this.errorMessage(
          error,
          'Clover reversal reconciliation query failed',
        ),
      };
    }
    return this.mergeProviderOutcome(transaction.id, input, outcome);
  }

  private providerRequest(
    transaction: PaymentTransaction,
    input: StartOrRecoverRefundInput,
  ) {
    const snapshot = transaction.toSnapshot();
    return {
      paymentId: snapshot.id,
      attemptId: snapshot.attemptId,
      source: snapshot.source,
      idempotencyKey: snapshot.idempotencyKey,
      operation: snapshot.operation,
      providerPaymentId: input.originalProviderPaymentId,
      providerRefundId: snapshot.providerRefundId,
      amountCents: snapshot.amountCents,
      currency: snapshot.currency,
      expectedAdditionalChargeRefundCents:
        input.expectedAdditionalChargeRefundCents,
    };
  }

  private async mergeProviderOutcome(
    paymentId: string,
    input: StartOrRecoverRefundInput,
    outcome: PaymentProviderOutcome,
  ): Promise<PaymentTransaction> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.requireReversal(paymentId, input);
      const currentStatus = current.status;
      const problems = this.correlationProblems(current, input, outcome);
      if (
        this.isFinalStatus(outcome.status) &&
        (outcome.status === 'SUCCEEDED' ||
          currentStatus === 'UNKNOWN' ||
          currentStatus === 'RECONCILING')
      ) {
        problems.push(
          ...this.canonicalEvidenceProblems(current, input, outcome),
        );
      }
      const uniqueProblems = [...new Set(problems)];

      if (this.isFinal(currentStatus)) {
        if (uniqueProblems.length > 0) {
          throw new PaymentProviderCorrelationConflictError(
            paymentId,
            uniqueProblems,
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
        throw new InvalidPaymentReversalError(
          `Cannot merge provider outcome while reversal ${paymentId} is CREATED`,
        );
      }

      let next: PaymentTransaction;
      if (uniqueProblems.length > 0) {
        const conflict: PaymentProviderOutcome = {
          status: 'UNKNOWN',
          failureCode: 'PAYMENT_REVERSAL_PROVIDER_CORRELATION_MISMATCH',
          failureMessage: `Provider reversal observation was not merged: ${uniqueProblems.join(', ')}`,
        };
        next =
          currentStatus === 'PROCESSING'
            ? current.applyProviderOutcome(conflict)
            : current.recordProviderObservation(conflict);
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
      `Payment reversal outcome merge did not converge for ${paymentId}`,
    );
  }

  private correlationProblems(
    transaction: PaymentTransaction,
    input: StartOrRecoverRefundInput,
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
      outcome.providerPaymentId !== undefined &&
      outcome.providerPaymentId !== null &&
      outcome.providerPaymentId !== input.originalProviderPaymentId
    ) {
      problems.push('original provider payment id mismatch');
    }
    if (
      outcome.amountCents !== undefined &&
      outcome.amountCents !== snapshot.amountCents
    ) {
      problems.push('refund amount mismatch');
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
    input: StartOrRecoverRefundInput,
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
    if (outcome.providerPaymentId !== input.originalProviderPaymentId) {
      problems.push(
        'canonical original provider payment id missing or mismatched',
      );
    }
    if (outcome.amountCents !== snapshot.amountCents) {
      problems.push('canonical refund amount missing or mismatched');
    }
    if (outcome.currency?.toUpperCase() !== snapshot.currency) {
      problems.push('canonical currency missing or mismatched');
    }
    if (outcome.status === 'SUCCEEDED') {
      if (outcome.refundedAmountCents !== snapshot.amountCents) {
        problems.push('canonical refunded amount missing or mismatched');
      }
      const expectedCustomerRefundTotal =
        snapshot.amountCents + input.expectedAdditionalChargeRefundCents;
      if (outcome.chargedTotalCents !== expectedCustomerRefundTotal) {
        problems.push('canonical customer refund total missing or mismatched');
      }
    }
    return problems;
  }

  private async refreshOriginalSaleBeforeReversal(
    input: StartOrRecoverRefundInput,
  ): Promise<void> {
    const original = await this.requireOriginalSale(input);
    const snapshot = original.toSnapshot();
    let outcome: PaymentProviderOutcome;
    try {
      outcome = await this.provider.getPaymentStatus({
        paymentId: snapshot.id,
        attemptId: snapshot.attemptId,
        source: snapshot.source,
        idempotencyKey: snapshot.idempotencyKey,
        operation: 'SALE',
        externalPaymentId: snapshot.externalPaymentId,
        providerPaymentId: snapshot.providerPaymentId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
      });
    } catch (error) {
      throw new PaymentReversalPreflightError(
        'PAYMENT_REVERSAL_PREFLIGHT_QUERY_FAILED',
        this.errorMessage(
          error,
          'Unable to confirm current Clover payment truth before reversal',
        ),
      );
    }

    const problems: string[] = [];
    if (outcome.evidence !== 'CANONICAL') {
      problems.push('canonical evidence missing');
    }
    if (outcome.paymentId !== snapshot.id) problems.push('payment id mismatch');
    if (outcome.attemptId !== snapshot.attemptId) {
      problems.push('attempt id mismatch');
    }
    if (outcome.idempotencyKey !== snapshot.idempotencyKey) {
      problems.push('idempotency identity mismatch');
    }
    if (outcome.externalPaymentId !== snapshot.externalPaymentId) {
      problems.push('externalPaymentId mismatch');
    }
    if (outcome.providerPaymentId !== snapshot.providerPaymentId) {
      problems.push('providerPaymentId mismatch');
    }
    if (outcome.amountCents !== snapshot.amountCents) {
      problems.push('amount mismatch');
    }
    if (outcome.currency?.toUpperCase() !== snapshot.currency) {
      problems.push('currency mismatch');
    }
    if (problems.length > 0 || outcome.status !== 'SUCCEEDED') {
      throw new PaymentReversalPreflightError(
        'PAYMENT_REVERSAL_PREFLIGHT_UNCERTAIN',
        problems.length > 0
          ? `Current Clover payment truth could not be correlated: ${problems.join(', ')}`
          : `Current Clover payment status is ${outcome.status}; reversal was not started`,
      );
    }
    if ((outcome.refundedAmountCents ?? 0) !== 0) {
      throw new PaymentReversalPreflightError(
        'PAYMENT_ORIGINAL_ALREADY_REFUNDED',
        'Clover already reports refund activity for the original payment; automatic full refund was not started',
      );
    }

    const observed = original.recordProviderObservation(outcome);
    await this.transactions.saveIfCurrentStatus(observed, 'SUCCEEDED');
  }

  private async recordOriginalSaleReversal(
    reversal: PaymentTransaction,
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    if (reversal.status !== 'SUCCEEDED') return reversal;
    const reversalSnapshot = reversal.toSnapshot();
    const original = await this.requireOriginalSale(input);
    const observation: PaymentProviderOutcome = {
      status: 'SUCCEEDED',
      providerPaymentId: input.originalProviderPaymentId,
      providerRefundId: reversalSnapshot.providerRefundId,
      refundedAmountCents: reversalSnapshot.refundedAmountCents,
    };
    const observed = original.recordProviderObservation(observation);
    await this.transactions.saveIfCurrentStatus(observed, 'SUCCEEDED');
    return reversal;
  }

  private async requireOriginalSale(
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    const original = await this.transactions.findById(input.originalPaymentId);
    if (!original) {
      throw new InvalidPaymentReversalError(
        `Original payment transaction not found: ${input.originalPaymentId}`,
      );
    }
    const snapshot = original.toSnapshot();
    if (
      snapshot.provider !== 'CLOVER' ||
      snapshot.source !== 'POS_TERMINAL' ||
      snapshot.paymentMethod !== 'CARD' ||
      snapshot.operation !== 'SALE' ||
      snapshot.status !== 'SUCCEEDED' ||
      snapshot.providerPaymentId !== input.originalProviderPaymentId ||
      snapshot.amountCents !== input.amountCents ||
      snapshot.currency !== input.currency
    ) {
      throw new InvalidPaymentReversalError(
        `Payment transaction ${snapshot.id} is not the expected successful Clover Terminal sale`,
      );
    }
    return original;
  }

  private async requireReversal(
    paymentId: string,
    input: StartOrRecoverRefundInput,
  ): Promise<PaymentTransaction> {
    const transaction = await this.transactions.findById(paymentId);
    if (!transaction) {
      throw new InvalidPaymentReversalError(
        `Payment reversal transaction not found: ${paymentId}`,
      );
    }
    this.assertReversal(transaction, input);
    return transaction;
  }

  private assertReversal(
    transaction: PaymentTransaction,
    input: StartOrRecoverRefundInput,
  ): void {
    const snapshot = transaction.toSnapshot();
    if (
      snapshot.provider !== 'CLOVER' ||
      snapshot.source !== 'POS_TERMINAL' ||
      snapshot.paymentMethod !== 'CARD' ||
      snapshot.operation !== input.operation ||
      snapshot.amountCents !== input.amountCents ||
      snapshot.currency !== input.currency ||
      snapshot.orderId !== input.orderId
    ) {
      throw new InvalidPaymentReversalError(
        `Payment transaction ${snapshot.id} does not match the requested Clover card reversal`,
      );
    }
    if (
      snapshot.providerPaymentId !== null &&
      snapshot.providerPaymentId !== input.originalProviderPaymentId
    ) {
      throw new InvalidPaymentReversalError(
        `Payment transaction ${snapshot.id} references a different original Clover payment`,
      );
    }
  }

  private isFinal(status: PaymentStatus): boolean {
    return this.isFinalStatus(status);
  }

  private isFinalStatus(status: PaymentStatus): boolean {
    return ['SUCCEEDED', 'DECLINED', 'CANCELLED', 'FAILED'].includes(status);
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim()
      ? error.message
      : fallback;
  }
}
