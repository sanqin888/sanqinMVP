import type { PaymentTransaction } from '../domain/payment-transaction';
import { TerminalPaymentService } from './create-payment-attempt.use-case';
import type {
  PaymentTerminalOperationRepository,
  SandboxManualUnpaidDecision,
} from './payment-terminal-operation.repository';
import type {
  PaymentProvider,
  PaymentTerminalAvailability,
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

  /** Legacy R2 requires its opt-in flag; PEM uses its own audited case gate. */
  isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED === 'true' &&
      this.isIsolatedSandbox(env);
  }

  /** Never treat NODE_ENV alone as proof of an isolated Sandbox. */
  isIsolatedSandbox(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.NODE_ENV !== 'development' && env.NODE_ENV !== 'test') {
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
    approvedExceptionCase?: boolean;
  }): Promise<PaymentTransaction> {
    if (!(input.approvedExceptionCase
      ? this.isIsolatedSandbox()
      : this.isEnabled())) {
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
    const historicalAllFailed =
      input.approvedExceptionCase === true &&
      original.failureCode === 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED';
    if (
      original.status !== 'RECONCILING' ||
      (!historicalAllFailed && (
        original.resultCode !== 'CLOVER_TERMINAL_SALE_HTTP_504' ||
        original.failureCode !== 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'
      )) ||
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
    if (!this.hasExplicitIdleEvidence(available, operation.terminalId)) {
      throw new Error('POS_SANDBOX_MANUAL_TERMINAL_NOT_IDLE');
    }
    const checked = await this.terminalPayments.reconcile(payment.id);
    const latest = checked.toSnapshot();
    if (
      checked.status !== 'RECONCILING' ||
      (!historicalAllFailed && latest.resultCode !== 'CLOVER_TERMINAL_SALE_HTTP_504') ||
      latest.failureCode !== (historicalAllFailed
        ? 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED'
        : 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND') ||
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
      originalResultCode: original.resultCode ?? 'UNRECORDED',
      originalFailureCode: latest.failureCode ?? '',
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
    approvedExceptionCase = false,
  ): Promise<boolean> {
    if (!(approvedExceptionCase ? this.isIsolatedSandbox() : this.isEnabled())) {
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
    )
      return false;
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
    const expectedCode = decision.originalFailureCode ===
      'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED'
        ? 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED'
        : 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND';
    if (
      canonical.status !== 'UNKNOWN' ||
      canonical.failureCode !== expectedCode ||
      (expectedCode === 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED' && (
        canonical.evidence !== 'CANONICAL' ||
        canonical.paymentId !== identity.id ||
        canonical.attemptId !== identity.attemptId ||
        canonical.idempotencyKey !== identity.idempotencyKey ||
        canonical.providerPaymentId != null ||
        canonical.externalPaymentId !== identity.externalPaymentId ||
        canonical.amountCents !== identity.amountCents ||
        canonical.currency !== identity.currency
      ))
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
    if (!this.hasExplicitIdleEvidence(available, decision.terminalId)) {
      return false;
    }
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
    if (!this.isIsolatedSandbox()) return false;
    const payment = await this.terminalPayments.findById(paymentId);
    const identity = payment.toSnapshot();
    if (
      identity.status !== 'FAILED' ||
      identity.resultCode !== 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID'
    )
      return false;
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
      (canonical.failureCode === 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND' ||
        (decision.originalFailureCode === 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED' &&
          canonical.failureCode === 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED'))
    )
      return false;
    throw new Error('POS_SANDBOX_MANUAL_CANONICAL_RECHECK_UNAVAILABLE');
  }

  /** The coarse AVAILABLE state may be synthesized for HTTP 200 without
   * device status. R2 requires an explicit idle response before money changes. */
  private hasExplicitIdleEvidence(
    availability: PaymentTerminalAvailability,
    terminalId: string,
  ): boolean {
    return (
      availability.available === true &&
      availability.terminalId === terminalId &&
      availability.providerStateExplicit === true &&
      typeof availability.providerState === 'string' &&
      /^(AVAILABLE|IDLE|READY)$/.test(
        availability.providerState.trim().toUpperCase(),
      )
    );
  }

  async checkpointSandboxBenefitsReleased(
    attemptId: string,
    approvedExceptionCase = false,
  ): Promise<void> {
    if (!(approvedExceptionCase ? this.isIsolatedSandbox() : this.isEnabled())) {
      throw new Error('POS_SANDBOX_MANUAL_RECOVERY_DISABLED');
    }
    await this.terminalOperations.checkpointSandboxBenefitsReleased(attemptId);
  }
}
