import type { PaymentTransaction } from '../domain/payment-transaction';
import { TerminalPaymentService } from './create-payment-attempt.use-case';
import type {
  PaymentTerminalOperationRepository,
  SandboxManualUnpaidDecision,
} from './payment-terminal-operation.repository';
import type {
  PaymentProvider,
  PaymentTerminalProvider,
} from './payment-provider.port';

/**
 * Strictly isolated test-only operator recovery. Never used by Ecommerce.
 * No automatic inference of finality from Platform NOT_FOUND.
 */
export class SandboxTerminalManualRecoveryService {
  constructor(
    private readonly terminalPayments: TerminalPaymentService,
    private readonly terminalOperations: PaymentTerminalOperationRepository,
    private readonly provider: PaymentProvider,
    private readonly terminalProvider: PaymentTerminalProvider,
  ) {}

  /** Sandbox-only, opt-in operator exception. NOT Clover-confirmed failure. */
  isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
      return false;
    }
    if (env.POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED !== 'true') {
      return false;
    }
    try {
      const db = new URL(env.DATABASE_URL ?? '');
      const platform = new URL(env.CLOVER_UNIFIED_PLATFORM_API_BASE ?? '');
      const merchant = env.CLOVER_UNIFIED_MERCHANT_ID?.trim();
      return (
        (db.protocol === 'postgres:' || db.protocol === 'postgresql:') &&
        ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) &&
        platform.protocol === 'https:' &&
        platform.hostname === 'apisandbox.dev.clover.com' &&
        Boolean(merchant) &&
        merchant !== env.CLOVER_MERCHANT_ID?.trim() &&
        Boolean(env.CLOVER_TERMINAL_DEVICE_ID?.trim())
      );
    } catch {
      return false;
    }
  }

  async getSandboxManualUnpaidDecision(
    attemptId: string,
  ): Promise<SandboxManualUnpaidDecision | null> {
    return this.terminalOperations.getSandboxManualUnpaidDecision(attemptId);
  }

  /** Every invocation rechecks canonical truth. A 504 + NOT_FOUND alone never
   * closes this payment; explicit authenticated operator evidence is required. */
  async acceptSandboxManualUnpaid(input: {
    paymentId: string;
    attemptId: string;
    storeStableId: string;
    actorUserStableId: string;
    cloverOrderId: string;
    operatorNote: string;
  }): Promise<PaymentTransaction> {
    if (!this.isEnabled()) {
      throw new Error('POS_SANDBOX_MANUAL_RECOVERY_DISABLED');
    }
    const payment = await this.terminalPayments.findById(input.paymentId);
    const original = payment.toSnapshot();
    if (
      original.attemptId !== input.attemptId ||
      original.source !== 'POS_TERMINAL' ||
      original.operation !== 'SALE' ||
      original.provider !== 'CLOVER'
    ) {
      throw new Error('POS_SANDBOX_MANUAL_IDENTITY_MISMATCH');
    }
    const existing = await this.getSandboxManualUnpaidDecision(input.attemptId);
    if (existing) {
      if (
        existing.paymentTransactionId !== payment.id ||
        existing.storeStableId !== input.storeStableId ||
        original.status !== 'FAILED' ||
        original.resultCode !== 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID'
      ) {
        throw new Error('POS_SANDBOX_MANUAL_DECISION_CONFLICT');
      }
      return payment;
    }
    if (
      original.status !== 'RECONCILING' ||
      original.resultCode !== 'CLOVER_TERMINAL_SALE_HTTP_504' ||
      original.failureCode !== 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND' ||
      original.providerPaymentId !== null ||
      !original.externalPaymentId ||
      Date.now() - original.createdAt.getTime() < 5 * 60 * 1000
    )
      throw new Error('POS_SANDBOX_MANUAL_RECOVERY_NOT_ELIGIBLE');
    const operation = await this.terminalOperations.findByAttemptId(
      input.attemptId,
    );
    if (
      !operation ||
      operation.state !== 'SALE_IN_FLIGHT' ||
      operation.storeStableId !== input.storeStableId ||
      operation.paymentTransactionId !== input.paymentId ||
      operation.externalPaymentId !== original.externalPaymentId ||
      operation.cancelRequestedAt !== null
    )
      throw new Error('POS_SANDBOX_MANUAL_TERMINAL_FENCE_CONFLICT');
    const available = await this.terminalPayments.getAvailability();
    if (
      !available.available ||
      !['AVAILABLE', 'IDLE', 'READY'].includes(available.state) ||
      available.terminalId !== operation.terminalId
    )
      throw new Error('POS_SANDBOX_MANUAL_TERMINAL_NOT_IDLE');
    const checked = await this.terminalPayments.reconcile(payment.id);
    const latest = checked.toSnapshot();
    if (
      checked.status !== 'RECONCILING' ||
      latest.resultCode !== 'CLOVER_TERMINAL_SALE_HTTP_504' ||
      latest.failureCode !== 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND' ||
      latest.providerPaymentId !== null ||
      latest.externalPaymentId !== original.externalPaymentId
    )
      throw new Error('POS_SANDBOX_MANUAL_CANONICAL_CONFLICT');
    const result = await this.terminalOperations.claimSandboxManualUnpaid({
      attemptId: input.attemptId,
      paymentTransactionId: payment.id,
      terminalId: operation.terminalId,
      storeStableId: input.storeStableId,
      externalPaymentId: original.externalPaymentId,
      actorUserStableId: input.actorUserStableId,
      cloverOrderId: input.cloverOrderId,
      operatorNote: input.operatorNote,
      originalResultCode: original.resultCode,
      originalFailureCode: original.failureCode ?? '',
      canonicalCheckedAt: new Date(),
    });
    if (result === 'CONFLICT') {
      throw new Error('POS_SANDBOX_MANUAL_CONCURRENT_DECISION');
    }
    return this.terminalPayments.findById(payment.id);
  }

  async finishSandboxManualUnpaid(
    attemptId: string,
    storeStableId: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }
    const decision = await this.getSandboxManualUnpaidDecision(attemptId);
    if (!decision || decision.storeStableId !== storeStableId) return false;
    const payment = await this.terminalPayments.findById(
      decision.paymentTransactionId,
    );
    const identity = payment.toSnapshot();
    if (
      payment.status !== 'FAILED' ||
      identity.resultCode !== 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID' ||
      identity.externalPaymentId !== decision.externalPaymentId
    ) return false;
    // Fresh canonical check even AFTER operator attestation. Late success
    // blocks this terminal rather than being overwritten by an old NOT_FOUND.
    const canonical = await this.provider.getPaymentStatus({
      paymentId: identity.id,
      attemptId: identity.attemptId,
      source: identity.source,
      idempotencyKey: identity.idempotencyKey,
      externalPaymentId: identity.externalPaymentId,
      providerPaymentId: identity.providerPaymentId,
      amountCents: identity.amountCents,
      currency: identity.currency,
    });
    if (
      canonical.status !== 'UNKNOWN' ||
      canonical.failureCode !== 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'
    ) {
      if (canonical.status === 'SUCCEEDED') {
        await this.terminalOperations.noteSandboxLateCanonicalSuccess(
          attemptId,
          canonical.providerPaymentId ?? null,
        );
      }
      throw new Error('POS_SANDBOX_MANUAL_LATE_CANONICAL_CONFLICT');
    }
    if (decision.terminalFinalizedAt) return true;
    const available = await this.terminalPayments.getAvailability();
    if (
      !available.available ||
      !['AVAILABLE', 'IDLE', 'READY'].includes(available.state) ||
      available.terminalId !== decision.terminalId
    ) return false;
    const idleWelcome = await this.terminalProvider.prepareOriginalSaleResume();
    if (!idleWelcome) return false;
    return this.terminalOperations.finalizeSandboxManualUnpaid(attemptId);
  }

  /** Explicit operator recheck even though local FAILED is already terminal.
   * Never merges a late success into an operator-closed payment silently. */
  async inspectSandboxLateCanonicalSuccess(
    paymentId: string,
    storeStableId: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const payment = await this.terminalPayments.findById(paymentId);
    const identity = payment.toSnapshot();
    if (
      identity.status !== 'FAILED' ||
      identity.resultCode !== 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID'
    ) return false;
    const decision = await this.getSandboxManualUnpaidDecision(
      identity.attemptId,
    );
    if (!decision || decision.storeStableId !== storeStableId) return false;
    if (decision.lateCanonicalAt) return true;
    const canonical = await this.provider.getPaymentStatus({
      paymentId: identity.id,
      attemptId: identity.attemptId,
      source: identity.source,
      idempotencyKey: identity.idempotencyKey,
      externalPaymentId: identity.externalPaymentId,
      providerPaymentId: identity.providerPaymentId,
      amountCents: identity.amountCents,
      currency: identity.currency,
    });
    if (canonical.status === 'SUCCEEDED') {
      await this.terminalOperations.noteSandboxLateCanonicalSuccess(
        identity.attemptId,
        canonical.providerPaymentId ?? null,
      );
      return true;
    }
    if (
      canonical.status === 'UNKNOWN' &&
      canonical.failureCode === 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'
    ) return false;
    throw new Error('POS_SANDBOX_MANUAL_CANONICAL_RECHECK_UNAVAILABLE');
  }

  async checkpointSandboxBenefitsReleased(attemptId: string): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('POS_SANDBOX_MANUAL_RECOVERY_DISABLED');
    }
    await this.terminalOperations.checkpointSandboxBenefitsReleased(attemptId);
  }
}
