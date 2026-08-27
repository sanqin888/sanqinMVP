import { TerminalPaymentService } from './create-payment-attempt.use-case';
import type { PaymentProviderTransactionLookup } from './payment-provider-transaction-lookup.port';
import type { PaymentProvider } from './payment-provider.port';
import type { PaymentReverseSyncPersistence } from './payment-reverse-sync-persistence.port';
import type { PaymentTransactionRepository } from './payment-transaction.repository';
import { PaymentReverseSyncService } from './payment-reverse-sync.service';
import type { PaymentProviderWebhookNotification } from './payment-provider-webhook.port';
import { PaymentTransaction } from '../domain/payment-transaction';
import type { PaymentTransactionSnapshot } from '../domain/payment-transaction';

const notification: PaymentProviderWebhookNotification = {
  eventId: 'clover_event_1',
  provider: 'CLOVER',
  merchantId: 'merchant-1',
  providerPaymentId: 'provider-payment-1',
  operation: 'UPDATE',
  occurredAt: new Date('2026-08-26T20:00:00.000Z'),
};

const sale = (
  overrides: Partial<PaymentTransactionSnapshot> = {},
): PaymentTransaction =>
  PaymentTransaction.restore({
    id: '11111111-1111-4111-8111-111111111111',
    attemptId: 'attempt-1',
    idempotencyKey: 'idempotency-1',
    orderId: null,
    checkoutIntentId: null,
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'SALE',
    amountCents: 1_000,
    surchargeCents: 24,
    chargedTotalCents: 1_024,
    refundedAmountCents: 0,
    currency: 'CAD',
    status: 'SUCCEEDED',
    externalPaymentId: 'external-1',
    providerPaymentId: 'provider-payment-1',
    providerRefundId: null,
    providerOrderId: 'provider-order-1',
    resultCode: 'SUCCESS',
    failureCode: null,
    failureMessage: null,
    terminalId: 'terminal-1',
    cardBrand: 'VISA',
    cardLast4: '4242',
    processedAt: new Date('2026-08-26T19:59:00.000Z'),
    completedAt: new Date('2026-08-26T19:59:10.000Z'),
    createdAt: new Date('2026-08-26T19:58:00.000Z'),
    updatedAt: new Date('2026-08-26T19:59:10.000Z'),
    ...overrides,
  });

type Lookup = PaymentProviderTransactionLookup['findSaleByProviderPaymentId'];
type FindById = PaymentTransactionRepository['findById'];
type SaveSuccessfulSaleObservation =
  PaymentReverseSyncPersistence['saveSuccessfulSaleObservation'];
type GetPaymentStatus = PaymentProvider['getPaymentStatus'];
type Reconcile = TerminalPaymentService['reconcile'];

const createHarness = () => {
  const findSaleByProviderPaymentId: jest.MockedFunction<Lookup> = jest.fn();
  const findById: jest.MockedFunction<FindById> = jest.fn();
  const saveSuccessfulSaleObservation: jest.MockedFunction<
    SaveSuccessfulSaleObservation
  > = jest.fn();
  const getPaymentStatus: jest.MockedFunction<GetPaymentStatus> = jest.fn();
  const reconcile: jest.MockedFunction<Reconcile> = jest.fn();

  const lookup = {
    findSaleByProviderPaymentId,
  } as PaymentProviderTransactionLookup;
  const transactions = {
    findById,
  } as unknown as PaymentTransactionRepository;
  const persistence = {
    saveSuccessfulSaleObservation,
  } as PaymentReverseSyncPersistence;
  const provider = {
    getPaymentStatus,
  } as unknown as PaymentProvider;
  const terminalPayments = {
    reconcile,
  } as unknown as TerminalPaymentService;

  const service = new PaymentReverseSyncService(
    lookup,
    transactions,
    persistence,
    provider,
    terminalPayments,
  );

  return {
    service,
    findSaleByProviderPaymentId,
    findById,
    saveSuccessfulSaleObservation,
    getPaymentStatus,
    reconcile,
  };
};

const canonicalOutcome = (
  overrides: Partial<Awaited<ReturnType<GetPaymentStatus>>> = {},
): Awaited<ReturnType<GetPaymentStatus>> => ({
  status: 'SUCCEEDED',
  evidence: 'CANONICAL',
  paymentId: '11111111-1111-4111-8111-111111111111',
  attemptId: 'attempt-1',
  idempotencyKey: 'idempotency-1',
  externalPaymentId: 'external-1',
  providerPaymentId: 'provider-payment-1',
  amountCents: 1_000,
  currency: 'CAD',
  surchargeCents: 24,
  chargedTotalCents: 1_024,
  refundedAmountCents: 0,
  resultCode: 'SUCCESS',
  ...overrides,
});

describe('PaymentReverseSyncService', () => {
  it('acknowledges an unknown provider payment without inventing a local transaction', async () => {
    const harness = createHarness();
    harness.findSaleByProviderPaymentId.mockResolvedValue(null);

    await expect(harness.service.reconcileNotification(notification)).resolves.toEqual(
      expect.objectContaining({
        processingResult: 'UNKNOWN_PAYMENT',
        payment: null,
        externalReversal: 'NONE',
      }),
    );
    expect(harness.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('applies a canonical external full refund to the historical successful sale', async () => {
    const harness = createHarness();
    const original = sale();
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({ refundedAmountCents: 1_000 }),
    );
    harness.findById.mockResolvedValue(original);
    harness.saveSuccessfulSaleObservation.mockImplementation((transaction) =>
      Promise.resolve({ updated: true, transaction }),
    );

    const result = await harness.service.reconcileNotification(notification);

    expect(result.processingResult).toBe('APPLIED');
    expect(result.externalReversal).toBe('FULL_REFUND');
    expect(result.previousRefundedAmountCents).toBe(0);
    expect(result.payment?.status).toBe('SUCCEEDED');
    expect(result.payment?.toSnapshot().refundedAmountCents).toBe(1_000);
    expect(harness.saveSuccessfulSaleObservation).toHaveBeenCalledWith(
      expect.any(PaymentTransaction),
    );
  });

  it('keeps refunded amount monotonic when a concurrent newer webhook wins persistence first', async () => {
    const harness = createHarness();
    const original = sale();
    const newer = sale({ refundedAmountCents: 1_000 });
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({ refundedAmountCents: 500 }),
    );
    harness.findById.mockResolvedValue(original);
    harness.saveSuccessfulSaleObservation.mockResolvedValue({
      updated: false,
      transaction: newer,
    });

    const syncResult = await harness.service.reconcileNotification(notification);

    expect(syncResult.processingResult).toBe('APPLIED');
    expect(syncResult.externalReversal).toBe('FULL_REFUND');
    expect(syncResult.payment?.toSnapshot().refundedAmountCents).toBe(1_000);
  });

  it('keeps an externally voided sale as historical success while recording full reversal facts', async () => {
    const harness = createHarness();
    const original = sale();
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({ status: 'CANCELLED', refundedAmountCents: 0 }),
    );
    harness.findById.mockResolvedValue(original);
    harness.saveSuccessfulSaleObservation.mockImplementation((transaction) =>
      Promise.resolve({ updated: true, transaction }),
    );

    const result = await harness.service.reconcileNotification(notification);

    expect(result.externalReversal).toBe('VOID');
    expect(result.payment?.status).toBe('SUCCEEDED');
    expect(result.payment?.toSnapshot()).toEqual(
      expect.objectContaining({
        refundedAmountCents: 1_000,
        resultCode: 'SUCCESS',
      }),
    );
  });

  it('ignores a stale out-of-order refund observation that would reduce refunded value', async () => {
    const harness = createHarness();
    const original = sale({ refundedAmountCents: 1_000 });
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({ refundedAmountCents: 0 }),
    );

    const result = await harness.service.reconcileNotification(notification);

    expect(result.processingResult).toBe('NO_CHANGE');
    expect(result.externalReversal).toBe('FULL_REFUND');
    expect(result.failureCode).toBe(
      'PAYMENT_WEBHOOK_STALE_REFUND_OBSERVATION_IGNORED',
    );
    expect(harness.saveSuccessfulSaleObservation).not.toHaveBeenCalled();
  });

  it('delegates uncertain in-flight POS payments to the existing terminal reconciliation state machine', async () => {
    const harness = createHarness();
    const processing = sale({
      status: 'PROCESSING',
      surchargeCents: null,
      chargedTotalCents: null,
      completedAt: null,
      refundedAmountCents: 0,
    });
    const reconciled = sale();
    harness.findSaleByProviderPaymentId.mockResolvedValue(processing);
    harness.reconcile.mockResolvedValue(reconciled);

    const result = await harness.service.reconcileNotification(notification);

    expect(harness.reconcile).toHaveBeenCalledWith(processing.id);
    expect(result.processingResult).toBe('APPLIED');
    expect(result.payment).toBe(reconciled);
    expect(harness.getPaymentStatus).not.toHaveBeenCalled();
  });

  it('defers completion when canonical v3 truth is temporarily unresolved', async () => {
    const harness = createHarness();
    const original = sale();
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({
        status: 'UNKNOWN',
        failureCode: 'CLOVER_PLATFORM_PAYMENT_QUERY_UNCERTAIN',
        failureMessage: 'temporary v3 query failure',
      }),
    );

    const syncResult = await harness.service.reconcileNotification(notification);

    expect(syncResult.processingResult).toBe('DEFERRED');
    expect(syncResult.failureCode).toBe(
      'CLOVER_PLATFORM_PAYMENT_QUERY_UNCERTAIN',
    );
    expect(harness.saveSuccessfulSaleObservation).not.toHaveBeenCalled();
  });

  it('does not mutate a final local success when Clover canonical identity conflicts', async () => {
    const harness = createHarness();
    const original = sale();
    harness.findSaleByProviderPaymentId.mockResolvedValue(original);
    harness.getPaymentStatus.mockResolvedValue(
      canonicalOutcome({ providerPaymentId: 'different-payment' }),
    );

    const result = await harness.service.reconcileNotification(notification);

    expect(result.processingResult).toBe('CONFLICT');
    expect(result.failureCode).toBe(
      'PAYMENT_WEBHOOK_CANONICAL_CORRELATION_CONFLICT',
    );
    expect(harness.saveSuccessfulSaleObservation).not.toHaveBeenCalled();
  });
});
