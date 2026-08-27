import type { PaymentProviderTransactionLookup } from './payment-provider-transaction-lookup.port';
import type { PaymentProvider } from './payment-provider.port';
import type { PaymentReverseSyncPersistence } from './payment-reverse-sync-persistence.port';
import type { PaymentTransactionRepository } from './payment-transaction.repository';
import type { PaymentProviderWebhookNotification } from './payment-provider-webhook.port';
import type { PaymentWebhookProcessingResult } from './payment-webhook-event.repository';
import { TerminalPaymentService } from './create-payment-attempt.use-case';
import type { PaymentTransaction } from '../domain/payment-transaction';
import type { PaymentProviderOutcome } from '../domain/payment.types';

export type PaymentReverseSyncExternalReversal =
  | 'NONE'
  | 'PARTIAL_REFUND'
  | 'FULL_REFUND'
  | 'VOID';

export type PaymentReverseSyncResult = {
  processingResult: PaymentWebhookProcessingResult;
  payment: PaymentTransaction | null;
  externalReversal: PaymentReverseSyncExternalReversal;
  previousRefundedAmountCents: number | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export class PaymentReverseSyncService {
  constructor(
    private readonly lookup: PaymentProviderTransactionLookup,
    private readonly transactions: PaymentTransactionRepository,
    private readonly persistence: PaymentReverseSyncPersistence,
    private readonly provider: PaymentProvider,
    private readonly terminalPayments: TerminalPaymentService,
  ) {}

  async reconcileNotification(
    notification: PaymentProviderWebhookNotification,
  ): Promise<PaymentReverseSyncResult> {
    const payment = await this.lookup.findSaleByProviderPaymentId(
      notification.provider,
      notification.providerPaymentId,
    );
    if (!payment) {
      return this.result('UNKNOWN_PAYMENT', null, 'NONE', null, null, null);
    }

    const before = payment.toSnapshot();
    if (
      before.provider !== notification.provider ||
      before.operation !== 'SALE' ||
      before.providerPaymentId !== notification.providerPaymentId
    ) {
      return this.result(
        'CONFLICT',
        payment,
        'NONE',
        before.refundedAmountCents,
        'PAYMENT_WEBHOOK_IDENTITY_CONFLICT',
        'The provider webhook does not match the mapped sale payment identity.',
      );
    }

    // Phase F is intentionally POS-first. Phase G will route Web Ecommerce
    // through the same canonical Payment core and can then reuse this path.
    if (before.source !== 'POS_TERMINAL') {
      return this.result(
        'NO_CHANGE',
        payment,
        'NONE',
        before.refundedAmountCents,
        'PAYMENT_WEBHOOK_SOURCE_NOT_MIGRATED',
        `Reverse sync is not enabled for payment source ${before.source} yet.`,
      );
    }

    if (
      before.status === 'PROCESSING' ||
      before.status === 'UNKNOWN' ||
      before.status === 'RECONCILING'
    ) {
      const reconciled = await this.terminalPayments.reconcile(payment.id);
      return this.fromSnapshots(before, reconciled);
    }

    if (before.status === 'CREATED') {
      return this.result(
        'DEFERRED',
        payment,
        'NONE',
        before.refundedAmountCents,
        'PAYMENT_WEBHOOK_PAYMENT_NOT_STARTED',
        'The mapped payment has not entered provider processing yet.',
      );
    }

    if (before.status !== 'SUCCEEDED') {
      const canonical = await this.queryCanonical(payment);
      const conflict = this.canonicalConflict(payment, canonical, false);
      if (conflict) return conflict;
      if (canonical.status === 'PROCESSING' || canonical.status === 'UNKNOWN') {
        return this.result(
          'DEFERRED',
          payment,
          'NONE',
          before.refundedAmountCents,
          canonical.failureCode ?? null,
          canonical.failureMessage ?? null,
        );
      }
      if (canonical.status === before.status) {
        return this.result(
          'NO_CHANGE',
          payment,
          'NONE',
          before.refundedAmountCents,
          null,
          null,
        );
      }
      return this.result(
        'CONFLICT',
        payment,
        'NONE',
        before.refundedAmountCents,
        'PAYMENT_WEBHOOK_FINAL_STATE_CONFLICT',
        `Local payment is ${before.status} while Clover canonical status is ${canonical.status}. Manual reconciliation is required.`,
      );
    }

    const canonical = await this.queryCanonical(payment);
    const conflict = this.canonicalConflict(payment, canonical, true);
    if (conflict) return conflict;

    if (canonical.status === 'PROCESSING' || canonical.status === 'UNKNOWN') {
      return this.result(
        'DEFERRED',
        payment,
        'NONE',
        before.refundedAmountCents,
        canonical.failureCode ?? null,
        canonical.failureMessage ?? null,
      );
    }

    if (canonical.status === 'DECLINED' || canonical.status === 'FAILED') {
      return this.result(
        'CONFLICT',
        payment,
        'NONE',
        before.refundedAmountCents,
        'PAYMENT_WEBHOOK_SUCCESS_REGRESSION_CONFLICT',
        `Clover canonical status ${canonical.status} conflicts with an already successful local sale.`,
      );
    }

    const normalized = this.normalizeSuccessfulSaleObservation(payment, canonical);
    if ('processingResult' in normalized) return normalized;

    const updated = await this.saveSuccessfulObservation(payment.id, normalized);
    return this.fromSnapshots(before, updated, canonical.status === 'CANCELLED');
  }

  private async queryCanonical(
    payment: PaymentTransaction,
  ): Promise<PaymentProviderOutcome> {
    const snapshot = payment.toSnapshot();
    try {
      return await this.provider.getPaymentStatus({
        paymentId: snapshot.id,
        attemptId: snapshot.attemptId,
        source: snapshot.source,
        idempotencyKey: snapshot.idempotencyKey,
        operation: snapshot.operation,
        externalPaymentId: snapshot.externalPaymentId,
        providerPaymentId: snapshot.providerPaymentId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
      });
    } catch (error) {
      return {
        status: 'UNKNOWN',
        evidence: 'CANONICAL',
        paymentId: snapshot.id,
        attemptId: snapshot.attemptId,
        idempotencyKey: snapshot.idempotencyKey,
        providerPaymentId: snapshot.providerPaymentId,
        externalPaymentId: snapshot.externalPaymentId,
        amountCents: snapshot.amountCents,
        currency: snapshot.currency,
        failureCode: 'PAYMENT_WEBHOOK_CANONICAL_QUERY_FAILED',
        failureMessage:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Canonical payment query failed during webhook reverse sync.',
      };
    }
  }

  private canonicalConflict(
    payment: PaymentTransaction,
    outcome: PaymentProviderOutcome,
    requireStableChargeFacts: boolean,
  ): PaymentReverseSyncResult | null {
    const snapshot = payment.toSnapshot();
    const problems: string[] = [];

    if (outcome.evidence !== 'CANONICAL') {
      problems.push('canonical evidence missing');
    }
    if (outcome.paymentId !== undefined && outcome.paymentId !== snapshot.id) {
      problems.push('internal payment id mismatch');
    }
    if (
      outcome.attemptId !== undefined &&
      outcome.attemptId !== snapshot.attemptId
    ) {
      problems.push('attempt id mismatch');
    }
    if (
      outcome.idempotencyKey !== undefined &&
      outcome.idempotencyKey !== snapshot.idempotencyKey
    ) {
      problems.push('idempotency key mismatch');
    }
    if (
      outcome.providerPaymentId !== undefined &&
      outcome.providerPaymentId !== snapshot.providerPaymentId
    ) {
      problems.push('provider payment id mismatch');
    }
    if (
      outcome.externalPaymentId !== undefined &&
      snapshot.externalPaymentId !== null &&
      outcome.externalPaymentId !== snapshot.externalPaymentId
    ) {
      problems.push('external payment id mismatch');
    }
    if (
      outcome.amountCents !== undefined &&
      outcome.amountCents !== snapshot.amountCents
    ) {
      problems.push('payment amount mismatch');
    }
    if (
      outcome.currency !== undefined &&
      outcome.currency.toUpperCase() !== snapshot.currency.toUpperCase()
    ) {
      problems.push('payment currency mismatch');
    }
    if (
      requireStableChargeFacts &&
      outcome.surchargeCents !== undefined &&
      snapshot.surchargeCents !== null &&
      outcome.surchargeCents !== snapshot.surchargeCents
    ) {
      problems.push('surcharge amount changed after successful sale');
    }
    if (
      requireStableChargeFacts &&
      outcome.chargedTotalCents !== undefined &&
      snapshot.chargedTotalCents !== null &&
      outcome.chargedTotalCents !== snapshot.chargedTotalCents
    ) {
      problems.push('charged total changed after successful sale');
    }

    if (problems.length === 0) return null;
    return this.result(
      'CONFLICT',
      payment,
      'NONE',
      snapshot.refundedAmountCents,
      'PAYMENT_WEBHOOK_CANONICAL_CORRELATION_CONFLICT',
      `Clover webhook canonical correlation failed: ${problems.join(', ')}`,
    );
  }

  private normalizeSuccessfulSaleObservation(
    payment: PaymentTransaction,
    outcome: PaymentProviderOutcome,
  ): PaymentProviderOutcome | PaymentReverseSyncResult {
    const snapshot = payment.toSnapshot();
    const isVoid = outcome.status === 'CANCELLED';
    const refundedAmountCents = isVoid
      ? snapshot.amountCents
      : (outcome.refundedAmountCents ?? snapshot.refundedAmountCents);

    if (
      !Number.isSafeInteger(refundedAmountCents) ||
      refundedAmountCents < 0 ||
      refundedAmountCents > snapshot.amountCents
    ) {
      return this.result(
        'CONFLICT',
        payment,
        'NONE',
        snapshot.refundedAmountCents,
        'PAYMENT_WEBHOOK_REFUND_AMOUNT_INVALID',
        'Clover canonical refunded amount is outside the original sale amount.',
      );
    }

    if (refundedAmountCents < snapshot.refundedAmountCents) {
      return this.result(
        'NO_CHANGE',
        payment,
        this.reversalKind(snapshot.refundedAmountCents, snapshot.amountCents, false),
        snapshot.refundedAmountCents,
        'PAYMENT_WEBHOOK_STALE_REFUND_OBSERVATION_IGNORED',
        'A stale/out-of-order Clover observation reported less refunded value than already recorded.',
      );
    }

    return {
      ...outcome,
      // A sale that was once successful remains a successful historical sale.
      // Void/refund state is represented by reversal facts, not by regressing
      // the SALE transaction into a terminal failure/cancel state.
      status: 'SUCCEEDED',
      refundedAmountCents,
      resultCode:
        outcome.resultCode ?? (isVoid ? 'CLOVER_EXTERNAL_VOID' : snapshot.resultCode),
      failureCode: null,
      failureMessage: null,
    };
  }

  private async saveSuccessfulObservation(
    paymentId: string,
    outcome: PaymentProviderOutcome,
  ): Promise<PaymentTransaction> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.transactions.findById(paymentId);
      if (!current) {
        throw new Error(`Payment transaction ${paymentId} disappeared during reverse sync`);
      }
      const snapshot = current.toSnapshot();
      if (snapshot.status !== 'SUCCEEDED') return current;

      const nextRefunded = outcome.refundedAmountCents ?? snapshot.refundedAmountCents;
      if (nextRefunded < snapshot.refundedAmountCents) return current;

      const next = current.recordProviderObservation(outcome);
      const saved = await this.persistence.saveSuccessfulSaleObservation(next);
      if (saved.updated) return saved.transaction;
      if (
        saved.transaction.toSnapshot().refundedAmountCents >=
        next.toSnapshot().refundedAmountCents
      ) {
        return saved.transaction;
      }
    }
    throw new Error(`Payment reverse sync did not converge for ${paymentId}`);
  }

  private fromSnapshots(
    before: ReturnType<PaymentTransaction['toSnapshot']>,
    payment: PaymentTransaction,
    forceVoid = false,
  ): PaymentReverseSyncResult {
    const after = payment.toSnapshot();
    const reversal = this.reversalKind(
      after.refundedAmountCents,
      after.amountCents,
      forceVoid,
    );
    const changed =
      before.status !== after.status ||
      before.refundedAmountCents !== after.refundedAmountCents ||
      before.resultCode !== after.resultCode ||
      before.failureCode !== after.failureCode ||
      before.failureMessage !== after.failureMessage;

    return this.result(
      changed ? 'APPLIED' : 'NO_CHANGE',
      payment,
      reversal,
      before.refundedAmountCents,
      after.failureCode,
      after.failureMessage,
    );
  }

  private reversalKind(
    refundedAmountCents: number,
    amountCents: number,
    forceVoid: boolean,
  ): PaymentReverseSyncExternalReversal {
    if (forceVoid && refundedAmountCents >= amountCents) return 'VOID';
    if (refundedAmountCents <= 0) return 'NONE';
    if (refundedAmountCents >= amountCents) return 'FULL_REFUND';
    return 'PARTIAL_REFUND';
  }

  private result(
    processingResult: PaymentWebhookProcessingResult,
    payment: PaymentTransaction | null,
    externalReversal: PaymentReverseSyncExternalReversal,
    previousRefundedAmountCents: number | null,
    failureCode: string | null,
    failureMessage: string | null,
  ): PaymentReverseSyncResult {
    return {
      processingResult,
      payment,
      externalReversal,
      previousRefundedAmountCents,
      failureCode,
      failureMessage,
    };
  }
}
