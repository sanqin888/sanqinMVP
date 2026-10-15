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
  PaymentTerminalOperationRepository,
  TerminalOperationState,
} from './payment-terminal-operation.repository';
import type {
  PaymentProvider,
  PaymentTerminalAvailability,
  PaymentTerminalProvider,
  TerminalCustomerInteractionStatus,
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

const ORIGINAL_504_RESULT_CODE = 'CLOVER_TERMINAL_SALE_HTTP_504';
const ORIGINAL_504_RESUME_CLAIM =
  'CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED';

/** One confirmed provider HTTP 504 + canonical NOT_FOUND, never a new payment. */
const isResumableOriginal504Sale = (
  transaction: PaymentTransaction,
): boolean => {
  const payment = transaction.toSnapshot();
  return (
    payment.source === 'POS_TERMINAL' &&
    payment.operation === 'SALE' &&
    (payment.status === 'UNKNOWN' || payment.status === 'RECONCILING') &&
    payment.resultCode === ORIGINAL_504_RESULT_CODE &&
    payment.failureCode === 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND' &&
    Boolean(payment.externalPaymentId) &&
    payment.providerPaymentId === null
  );
};

export class TerminalPaymentService {
  constructor(
    private readonly createAttempt: CreatePaymentAttemptUseCase,
    private readonly transactions: PaymentTransactionRepository,
    private readonly provider: PaymentProvider,
    private readonly terminalProvider: PaymentTerminalProvider,
    private readonly terminalOperations?: PaymentTerminalOperationRepository,
  ) {}

  canResumeOriginal504Sale(transaction: PaymentTransaction): boolean {
    return isResumableOriginal504Sale(transaction);
  }

  /** Scoped durable fence read for POS operations review, not payment truth. */
  async getTerminalOperationReview(
    attemptId: string,
    storeStableId: string,
  ): Promise<{ terminalId: string; state: TerminalOperationState } | null> {
    const operation = await this.terminalOperations?.findByAttemptId(attemptId);
    if (!operation || operation.storeStableId !== storeStableId) return null;
    return {
      terminalId: operation.terminalId,
      state: operation.state,
    };
  }

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

  async cancelCustomerConfirmation(): Promise<void> {
    try {
      await this.terminalProvider.cancelCustomerConfirmation();
    } catch {
      // Device acknowledgement is not financial cancellation evidence.
    }
  }

  // UI cleanup/confirmation is best-effort; it must never change money facts.
  async completeCustomerInteraction(
    status: TerminalCustomerInteractionStatus,
    failureCode?: string | null,
    allowRetry = true,
  ): Promise<boolean> {
    try {
      return await this.terminalProvider.completeCustomerInteraction(
        status,
        failureCode,
        allowRetry,
      );
    } catch {
      return false;
    }
  }

  /**
   * Reserve a single Compact for exactly one store/attempt before claiming
   * checkout provider start. A held/uncertain previous Sale cannot be stolen.
   */
  async reserveSale(
    attemptId: string,
    storeStableId: string,
    availability: PaymentTerminalAvailability,
  ): Promise<boolean> {
    if (
      !this.terminalOperations ||
      !availability.available ||
      !availability.terminalId
    ) {
      return false;
    }
    return this.terminalOperations.reserve(
      availability.terminalId,
      storeStableId,
      attemptId,
    );
  }

  /** Persist cancellation while the checkout is PROCESSING but payment is not yet visible. */
  async requestPendingCancel(
    attemptId: string,
    storeStableId: string,
  ): Promise<{ requested: boolean; safeBeforeDispatch: boolean }> {
    if (!this.terminalOperations) {
      return { requested: false, safeBeforeDispatch: false };
    }
    const previous = await this.terminalOperations.findByAttemptId(attemptId);
    if (!previous || previous.storeStableId !== storeStableId) {
      return { requested: false, safeBeforeDispatch: false };
    }
    // If the device dispatch was already claimed, delegate to the same
    // identity-checked cancel command rather than merely recording an ACK.
    if (previous.paymentTransactionId) {
      const linked = await this.transactions.findById(
        previous.paymentTransactionId,
      );
      if (linked) await this.cancel(linked.id, storeStableId);
      return { requested: true, safeBeforeDispatch: false };
    }
    const claimed = await this.terminalOperations.requestCancel(
      attemptId,
      storeStableId,
    );
    const safeBeforeDispatch =
      claimed.operation?.paymentTransactionId === null &&
      claimed.operation.state === 'CANCEL_REQUESTED';
    return {
      requested: claimed.operation !== null,
      safeBeforeDispatch,
    };
  }

  async completeUndispatchedCancel(attemptId: string): Promise<boolean> {
    if (!this.terminalOperations) return false;
    const operation = await this.terminalOperations.findByAttemptId(attemptId);
    if (!operation) return false;
    if (operation.state === 'FINALIZED') return true;
    if (!['CANCEL_REQUESTED', 'CANCEL_ACKED'].includes(operation.state)) {
      return false;
    }
    const payment = await this.transactions.findByAttemptId(attemptId);
    const neverDispatched = payment
      ? payment.status === 'CANCELLED' &&
        payment.toSnapshot().resultCode ===
          'TERMINAL_CANCELLED_BEFORE_DISPATCH' &&
        (operation.paymentTransactionId === null ||
          operation.paymentTransactionId === payment.id)
      : operation.paymentTransactionId === null;
    if (!neverDispatched) return false;
    await this.terminalOperations.complete(attemptId);
    return true;
  }

  /** Best-effort display recovery; never treats Welcome or IDLE as financial truth. */
  async finishTerminalOperation(attemptId: string): Promise<boolean> {
    if (!this.terminalOperations) return false;
    const operation = await this.terminalOperations.findByAttemptId(attemptId);
    if (!operation) return false;
    const payment = await this.transactions.findByAttemptId(attemptId);
    if (!payment || !this.isFinal(payment)) return false;
    if (operation.state === 'FINALIZED') return true;
    // The owning orchestration invokes this only after a definitive outcome
    // (and after benefits release for a cancelled checkout).
    const ready = await this.terminalProvider.prepareOriginalSaleResume();
    if (ready) await this.terminalOperations.complete(attemptId);
    return ready;
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

    if (this.terminalOperations) {
      const dispatched = await this.terminalOperations.claimDispatch(
        input.attemptId,
        transaction.id,
        transaction.toSnapshot().externalPaymentId ?? '',
      );
      if (!dispatched) {
        // A reserved operation may have been cancelled before the Sale was sent.
        // Without our durable terminal fence, never send a provider command.
        const operation = await this.terminalOperations.findByAttemptId(
          input.attemptId,
        );
        if (
          operation?.paymentTransactionId === transaction.id &&
          (operation.state === 'SALE_IN_FLIGHT' ||
            operation.state === 'CANCEL_REQUESTED' ||
            operation.state === 'CANCEL_ACKED')
        ) {
          // Another caller won this exact Attempt's durable dispatch claim.
          // Never cancel its CREATED transaction or issue a second Sale.
          return transaction;
        }
        const safeCancelled =
          operation?.state === 'CANCEL_REQUESTED' &&
          operation.paymentTransactionId === null;
        // Never manufacture cancellation merely because we failed to claim
        // the terminal. Only the persisted pre-dispatch Cancel proves safety.
        if (!safeCancelled) return transaction;
        const local = transaction.applyProviderOutcome({
          status: 'CANCELLED',
          resultCode: 'TERMINAL_CANCELLED_BEFORE_DISPATCH',
        });
        const saved = await this.transactions.saveIfCurrentStatus(
          local,
          'CREATED',
        );
        // Preserve the terminal fence until Checkout completes Benefits RELEASE.
        return saved.transaction;
      }
    }

    const processing = transaction.transitionTo('PROCESSING');
    const claimed = await this.transactions.saveIfCurrentStatus(
      processing,
      'CREATED',
    );
    if (!claimed.updated) return claimed.transaction;

    const snapshot = claimed.transaction.toSnapshot();
    if (this.terminalOperations) {
      const operation = await this.terminalOperations.findByAttemptId(
        snapshot.attemptId,
      );
      if (
        operation?.paymentTransactionId === snapshot.id &&
        (operation.state === 'CANCEL_REQUESTED' ||
          operation.state === 'CANCEL_ACKED')
      ) {
        // Dispatch was claimed but this worker has not sent the Sale yet.
        // Prevent the provider call and close from the owned local evidence.
        const cancelled = claimed.transaction.applyProviderOutcome({
          status: 'CANCELLED',
          resultCode: 'TERMINAL_CANCELLED_BEFORE_DISPATCH',
        });
        const local = await this.transactions.saveIfCurrentStatus(
          cancelled,
          'PROCESSING',
        );
        // No Clover Sale was sent; the checkout will release Benefits before
        // the terminal operation is finalized.
        return local.transaction;
      }
    }
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

    // A device-level Cancel can race with a successful card tap. Before
    // accepting the original Sale 209, query canonical financial truth using
    // the SAME frozen identity. An unavailable query is not a negative result.
    if (
      this.terminalOperations &&
      outcome.status === 'CANCELLED' &&
      outcome.evidence === 'TERMINAL_SALE_CANCELLED'
    ) {
      try {
        const canonical = await this.provider.getPaymentStatus({
          paymentId: snapshot.id,
          attemptId: snapshot.attemptId,
          source: snapshot.source,
          idempotencyKey: snapshot.idempotencyKey,
          externalPaymentId: snapshot.externalPaymentId,
          providerPaymentId: snapshot.providerPaymentId,
          amountCents: snapshot.amountCents,
          currency: snapshot.currency,
        });
        if (canonical.status === 'SUCCEEDED') {
          outcome = canonical;
        } else if (
          canonical.status !== 'UNKNOWN' ||
          canonical.failureCode !== 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'
        ) {
          outcome = providerCallUnknown(
            'TERMINAL_SALE_CANCEL_CANONICAL_REVIEW',
            'Original Sale ended with 209, but canonical verification is not yet conclusive',
          );
        }
      } catch {
        outcome = providerCallUnknown(
          'TERMINAL_SALE_CANCEL_CANONICAL_UNAVAILABLE',
          'Cannot confirm canonical payment status after original Sale cancellation',
        );
      }
    }

    let persisted = await this.mergeProviderOutcome(
      claimed.transaction.id,
      outcome,
    );
    if (
      outcome.resultCode === ORIGINAL_504_RESULT_CODE &&
      ['UNKNOWN', 'RECONCILING'].includes(persisted.status)
    ) {
      // The provider Sale is over, but its financial outcome is not known.
      // Device UI cleanup must not cancel/release the Payment or create an Order.
      try {
        await this.terminalProvider.clearTimedOutSaleDisplay(
          snapshot.externalPaymentId ?? '',
        );
      } catch {
        // Device cleanup is best-effort, never payment truth.
      }
      try {
        persisted = await this.reconcile(persisted.id);
      } catch {
        // Keep the original durable 504 evidence if the re-query is uncertain.
      }
    }
    return persisted;
  }

  /**
   * Explicit operator action after the *original* Sale returned HTTP 504.
   * Canonical truth is queried first. Then a one-time DB claim ensures that
   * multi-click / multiple API workers cannot send parallel Sale requests.
   * The provider request keeps the original payment, idempotency and amount.
   */
  async resumeOriginal504Sale(paymentId: string): Promise<PaymentTransaction> {
    const previous = await this.requireTerminalSale(paymentId);
    if (!isResumableOriginal504Sale(previous)) return previous;
    if (this.terminalOperations) {
      const operation = await this.terminalOperations.findByAttemptId(
        previous.toSnapshot().attemptId,
      );
      if (
        operation?.state !== 'SALE_IN_FLIGHT' ||
        operation.paymentTransactionId !== paymentId ||
        operation.externalPaymentId !== previous.toSnapshot().externalPaymentId
      ) {
        throw new InvalidTerminalPaymentError(
          'Original Sale resume is blocked by terminal ownership or cancellation; reconcile the existing payment',
        );
      }
    }

    const reconciled = await this.reconcile(paymentId);
    if (!isResumableOriginal504Sale(reconciled)) return reconciled;

    const availability = await this.getAvailability();
    if (availability.state !== 'AVAILABLE' || !availability.available) {
      throw new InvalidTerminalPaymentError(
        'Clover device is not idle; original payment must be reconciled before resuming',
      );
    }

    const claim = await this.transactions.claimUncertainResultCode(
      paymentId,
      ORIGINAL_504_RESULT_CODE,
      ORIGINAL_504_RESUME_CLAIM,
      'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    );
    if (!claim.updated) return claim.transaction;

    // Display cleanup is not financial cancellation; never release HOLD here.
    if (!(await this.terminalProvider.prepareOriginalSaleResume())) {
      return claim.transaction;
    }
    const original = claim.transaction.toSnapshot();
    let outcome: PaymentProviderOutcome;
    try {
      outcome = await this.provider.startPayment({
        paymentId: original.id,
        attemptId: original.attemptId,
        amountCents: original.amountCents,
        currency: original.currency,
        paymentMethod: original.paymentMethod,
        source: original.source,
        idempotencyKey: original.idempotencyKey,
        externalPaymentId: original.externalPaymentId,
        description: 'SanQ POS card sale',
      });
    } catch (error) {
      outcome = providerCallUnknown(
        'TERMINAL_ORIGINAL_504_RESUME_UNCERTAIN',
        this.errorMessage(error, 'Original Clover Sale resume is uncertain'),
      );
    }
    // A second 504 never re-arms the one-time replay. Success / definitive
    // outcomes still go through canonical reconciliation and finalization.
    if (outcome.status === 'UNKNOWN' || outcome.status === 'PROCESSING') {
      outcome = { ...outcome, resultCode: ORIGINAL_504_RESUME_CLAIM };
    }
    return this.mergeProviderOutcome(paymentId, outcome);
  }

  async findById(paymentId: string): Promise<PaymentTransaction> {
    return this.requireTransaction(paymentId);
  }

  async cancel(
    paymentId: string,
    storeStableId?: string,
  ): Promise<PaymentTransaction> {
    let transaction = await this.requireTerminalSale(paymentId);
    const identity = transaction.toSnapshot();
    let sendDeviceCancel = transaction.status === 'PROCESSING';
    if (this.terminalOperations) {
      const operation = await this.terminalOperations.findByAttemptId(
        identity.attemptId,
      );
      // Device Cancel is NOT payment-scoped. Never interrupt another terminal
      // operation or accept a mismatched store/transaction binding.
      if (
        !operation ||
        !storeStableId ||
        operation.storeStableId !== storeStableId ||
        (operation.paymentTransactionId !== null &&
          operation.paymentTransactionId !== paymentId) ||
        (operation.externalPaymentId !== null &&
          operation.externalPaymentId !== identity.externalPaymentId)
      ) {
        return transaction;
      }
      if (
        transaction.status !== 'CREATED' &&
        transaction.status !== 'PROCESSING'
      ) {
        return transaction;
      }
      const claim = await this.terminalOperations.requestCancel(
        identity.attemptId,
        storeStableId,
      );
      if (!claim.requested) return transaction;
      sendDeviceCancel = claim.sendDeviceCancel;
    }
    if (transaction.status === 'CREATED' && !sendDeviceCancel) {
      // The CAS fence was still RESERVED: original Sale cannot be dispatched
      // after CANCEL_REQUESTED, so a CREATED transaction may close locally.
      const cancelled = transaction.applyProviderOutcome({
        status: 'CANCELLED',
        resultCode: 'TERMINAL_CANCELLED_BEFORE_DISPATCH',
      });
      const localCancel = await this.transactions.saveIfCurrentStatus(
        cancelled,
        'CREATED',
      );
      if (localCancel.updated) {
        return localCancel.transaction;
      }
      transaction = localCancel.transaction;
    }

    if (
      !sendDeviceCancel ||
      !['CREATED', 'PROCESSING'].includes(transaction.status)
    ) {
      return transaction;
    }

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

    if (outcome.failureCode === 'CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED') {
      await this.terminalOperations?.acknowledgeCancel(snapshot.attemptId);
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

    const latest = await this.requireTerminalSale(transaction.id);
    if (latest.status === 'CREATED') {
      // A concurrent dispatcher has not yet published PROCESSING. The durable
      // CANCEL_REQUESTED/CANCEL_ACKED fence remains until original Sale finality.
      return latest;
    }
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
      const observation = transaction.toSnapshot();
      const moved = await this.transactions.saveIfCurrentStatus(
        reconciling,
        'UNKNOWN',
        {
          updatedAt: observation.updatedAt,
          resultCode: observation.resultCode,
          failureCode: observation.failureCode,
        },
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

      // The original Sale HTTP 209 is definitive cancellation evidence even
      // when a concurrent POS /device/cancel already moved us to UNKNOWN.
      // Never apply this exception to a cancel-command ACK or message text.
      const originalSaleCancelled =
        outcome.status === 'CANCELLED' &&
        outcome.evidence === 'TERMINAL_SALE_CANCELLED' &&
        outcome.resultCode === 'CLOVER_CANCELLED' &&
        current.toSnapshot().source === 'POS_TERMINAL' &&
        current.toSnapshot().operation === 'SALE';
      const requiresCanonicalFinal =
        this.isFinalStatus(outcome.status) &&
        !originalSaleCancelled &&
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

      // Compare the observation as well as status. An in-flight canonical
      // read must not overwrite a concurrent one-time 504 replay claim.
      const observation = current.toSnapshot();
      const saved = await this.transactions.saveIfCurrentStatus(
        next,
        currentStatus,
        {
          updatedAt: observation.updatedAt,
          resultCode: observation.resultCode,
          failureCode: observation.failureCode,
        },
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
    if (outcome.tipCents === undefined) {
      problems.push('canonical provider tip amount missing');
    }
    if (outcome.surchargeCents === undefined) {
      problems.push('canonical provider surcharge amount missing');
    }
    if (outcome.chargedTotalCents === undefined) {
      problems.push('canonical charged total missing');
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
