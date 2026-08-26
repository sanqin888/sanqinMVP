import {
  assertPaymentStatusTransition,
  isTerminalPaymentStatus,
} from './payment-state-machine';
import type {
  PaymentMethod,
  PaymentOperation,
  PaymentProviderName,
  PaymentProviderOutcome,
  PaymentSource,
  PaymentStatus,
} from './payment.types';

export type PaymentTransactionSnapshot = {
  id: string;
  attemptId: string;
  idempotencyKey: string;
  orderId: string | null;
  checkoutIntentId: string | null;
  provider: PaymentProviderName;
  source: PaymentSource;
  paymentMethod: PaymentMethod;
  operation: PaymentOperation;
  amountCents: number;
  surchargeCents: number | null;
  chargedTotalCents: number | null;
  refundedAmountCents: number;
  currency: string;
  status: PaymentStatus;
  externalPaymentId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
  providerOrderId: string | null;
  resultCode: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  terminalId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  processedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentTransactionInput = {
  id: string;
  attemptId: string;
  idempotencyKey: string;
  orderId?: string | null;
  checkoutIntentId?: string | null;
  provider: PaymentProviderName;
  source: PaymentSource;
  paymentMethod: PaymentMethod;
  operation: PaymentOperation;
  amountCents: number;
  currency: string;
  externalPaymentId?: string | null;
  createdAt?: Date;
};

const requireNonEmpty = (label: string, value: string): string => {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
  return value;
};

const requireMoney = (label: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer number of cents`);
  }
  return value;
};

const requirePositiveMoney = (label: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents`);
  }
  return value;
};

const requireCurrency = (currency: string): string => {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('currency must be a three-letter uppercase ISO code');
  }
  return currency;
};

const keepWhenUndefined = <T>(current: T, next: T | undefined): T =>
  next === undefined ? current : next;

const mergeStableIdentifier = (
  label: string,
  current: string | null,
  next: string | null | undefined,
): string | null => {
  if (next === undefined || next === null) return current;
  if (current !== null && current !== next) {
    throw new Error(`${label} cannot change once recorded`);
  }
  return next;
};

const mergeProviderFacts = (
  snapshot: PaymentTransactionSnapshot,
  outcome: PaymentProviderOutcome,
  occurredAt: Date,
): PaymentTransactionSnapshot => {
  const surchargeCents = keepWhenUndefined(
    snapshot.surchargeCents,
    outcome.surchargeCents,
  );
  const chargedTotalCents = keepWhenUndefined(
    snapshot.chargedTotalCents,
    outcome.chargedTotalCents,
  );
  const refundedAmountCents = keepWhenUndefined(
    snapshot.refundedAmountCents,
    outcome.refundedAmountCents,
  );

  if (surchargeCents !== null) requireMoney('surchargeCents', surchargeCents);
  if (chargedTotalCents !== null) {
    requireMoney('chargedTotalCents', chargedTotalCents);
  }
  requireMoney('refundedAmountCents', refundedAmountCents);

  return {
    ...snapshot,
    surchargeCents,
    chargedTotalCents,
    refundedAmountCents,
    externalPaymentId: mergeStableIdentifier(
      'externalPaymentId',
      snapshot.externalPaymentId,
      outcome.externalPaymentId,
    ),
    providerPaymentId: mergeStableIdentifier(
      'providerPaymentId',
      snapshot.providerPaymentId,
      outcome.providerPaymentId,
    ),
    providerRefundId: mergeStableIdentifier(
      'providerRefundId',
      snapshot.providerRefundId,
      outcome.providerRefundId,
    ),
    providerOrderId: mergeStableIdentifier(
      'providerOrderId',
      snapshot.providerOrderId,
      outcome.providerOrderId,
    ),
    terminalId: keepWhenUndefined(snapshot.terminalId, outcome.terminalId),
    cardBrand: keepWhenUndefined(snapshot.cardBrand, outcome.cardBrand),
    cardLast4: keepWhenUndefined(snapshot.cardLast4, outcome.cardLast4),
    resultCode: keepWhenUndefined(snapshot.resultCode, outcome.resultCode),
    failureCode: keepWhenUndefined(snapshot.failureCode, outcome.failureCode),
    failureMessage: keepWhenUndefined(
      snapshot.failureMessage,
      outcome.failureMessage,
    ),
    updatedAt: occurredAt,
  };
};

export class PaymentTransaction {
  private constructor(private readonly snapshot: PaymentTransactionSnapshot) {}

  static create(input: CreatePaymentTransactionInput): PaymentTransaction {
    const createdAt = input.createdAt ?? new Date();
    return new PaymentTransaction({
      id: requireNonEmpty('payment id', input.id),
      attemptId: requireNonEmpty('payment attempt id', input.attemptId),
      idempotencyKey: requireNonEmpty(
        'payment idempotency key',
        input.idempotencyKey,
      ),
      orderId: input.orderId ?? null,
      checkoutIntentId: input.checkoutIntentId ?? null,
      provider: input.provider,
      source: input.source,
      paymentMethod: input.paymentMethod,
      operation: input.operation,
      amountCents: requirePositiveMoney('amountCents', input.amountCents),
      surchargeCents: null,
      chargedTotalCents: null,
      refundedAmountCents: 0,
      currency: requireCurrency(input.currency),
      status: 'CREATED',
      externalPaymentId: input.externalPaymentId ?? null,
      providerPaymentId: null,
      providerRefundId: null,
      providerOrderId: null,
      resultCode: null,
      failureCode: null,
      failureMessage: null,
      terminalId: null,
      cardBrand: null,
      cardLast4: null,
      processedAt: null,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  static restore(snapshot: PaymentTransactionSnapshot): PaymentTransaction {
    requireNonEmpty('payment id', snapshot.id);
    requireNonEmpty('payment attempt id', snapshot.attemptId);
    requireNonEmpty('payment idempotency key', snapshot.idempotencyKey);
    requirePositiveMoney('amountCents', snapshot.amountCents);
    requireMoney('refundedAmountCents', snapshot.refundedAmountCents);
    if (snapshot.surchargeCents !== null) {
      requireMoney('surchargeCents', snapshot.surchargeCents);
    }
    if (snapshot.chargedTotalCents !== null) {
      requireMoney('chargedTotalCents', snapshot.chargedTotalCents);
    }
    requireCurrency(snapshot.currency);
    return new PaymentTransaction({ ...snapshot });
  }

  get id(): string {
    return this.snapshot.id;
  }

  get attemptId(): string {
    return this.snapshot.attemptId;
  }

  get idempotencyKey(): string {
    return this.snapshot.idempotencyKey;
  }

  get status(): PaymentStatus {
    return this.snapshot.status;
  }

  toSnapshot(): PaymentTransactionSnapshot {
    return { ...this.snapshot };
  }

  transitionTo(
    nextStatus: PaymentStatus,
    occurredAt: Date = new Date(),
  ): PaymentTransaction {
    assertPaymentStatusTransition(this.snapshot.status, nextStatus);

    return new PaymentTransaction({
      ...this.snapshot,
      status: nextStatus,
      processedAt:
        nextStatus === 'PROCESSING' && this.snapshot.processedAt === null
          ? occurredAt
          : this.snapshot.processedAt,
      completedAt: isTerminalPaymentStatus(nextStatus)
        ? occurredAt
        : this.snapshot.completedAt,
      updatedAt: occurredAt,
    });
  }

  applyProviderOutcome(
    outcome: PaymentProviderOutcome,
    occurredAt: Date = new Date(),
  ): PaymentTransaction {
    const transitioned = this.transitionTo(outcome.status, occurredAt).snapshot;
    return new PaymentTransaction(
      mergeProviderFacts(transitioned, outcome, occurredAt),
    );
  }

  recordProviderObservation(
    outcome: PaymentProviderOutcome,
    occurredAt: Date = new Date(),
  ): PaymentTransaction {
    return new PaymentTransaction(
      mergeProviderFacts(this.snapshot, outcome, occurredAt),
    );
  }
}
