/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import type { CreateOrderInput } from '@shared/order';

import type {
  PaymentOrderFinalizationPort,
  PosOrderDto,
  PosOrderOperationsPort,
} from '../orders/public-api';
import type { TerminalPaymentService } from '../payments/application/create-payment-attempt.use-case';
import type { SandboxTerminalManualRecoveryService } from '../payments/application/sandbox-terminal-manual-recovery.service';
import type { PaymentTransactionRepository } from '../payments/application/payment-transaction.repository';
import { PaymentTransaction } from '../payments/domain/payment-transaction';
import type { PosCardPaymentFeatureConfig } from '../pos/pos-card-payment-feature.config';
import type { PosPaymentRealtimePort } from '../pos/public-api';
import type {
  PaymentCheckoutAttemptService,
  PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
const storeStableId = '4750_Yonge_Street';

const orderInput: CreateOrderInput = {
  channel: 'in_store',
  fulfillmentType: 'pickup',
  paymentMethod: 'CARD',
  userStableId: 'cmember1',
  pointsToRedeem: 2,
  balanceUsedCents: 300,
  items: [{ productStableId: 'citem1', qty: 1, unitPrice: 10 }],
};

const orderDto = {
  orderStableId: 'cpaymentorder1',
  orderNumber: 'SQ2608260001',
  pickupCode: '0001',
} as PosOrderDto;

const checkoutFixture = (
  overrides: Partial<PreparedPaymentCheckout> = {},
): PreparedPaymentCheckout => ({
  id: 'checkout-row-1',
  attemptId: 'attempt-1',
  idempotencyKey: 'checkout_identity_1',
  source: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  storeId: storeStableId,
  status: 'PREPARED',
  externalAmountCents: 700,
  paymentTransactionId: null,
  orderStableId: 'cpaymentorder1',
  expiresAt: new Date('2026-08-26T23:00:00.000Z'),
  snapshot: {
    version: 2,
    order: {
      userStableId: orderInput.userStableId ?? null,
      channel: orderInput.channel,
      fulfillmentType: orderInput.fulfillmentType,
      contactName: orderInput.contactName ?? null,
      contactEmail: orderInput.contactEmail ?? null,
      contactPhone: orderInput.contactPhone ?? null,
    },
    storeStableId,
    pricing: {
      subtotalCents: 1200,
      displaySubtotalCents: 1200,
      appliedDiscounts: [],
      couponDiscountCents: 100,
      automaticPromotionDiscountCents: 0,
      posManualDiscountCents: 0,
      loyaltyRedeemCents: 200,
      taxCents: 100,
      deliveryFeeCents: 0,
      totalCents: 1000,
    },
    tender: {
      pointsCents: 200,
      balanceCents: 300,
      couponDiscountCents: 100,
      orderTotalCents: 1000,
      externalCents: 700,
    },
    items: [],
    promotionSnapshot: {},
    coupon: null,
    preparedAt: '2026-08-26T22:00:00.000Z',
  },
  ...overrides,
});

const paymentFixture = (
  status:
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'DECLINED'
    | 'CANCELLED'
    | 'UNKNOWN'
    | 'RECONCILING'
    | 'FAILED',
  amountCents = 700,
  canonicalChargeFacts: {
    surchargeCents: number;
    chargedTotalCents: number;
  } = { surchargeCents: 20, chargedTotalCents: amountCents + 20 },
): PaymentTransaction => {
  let payment = PaymentTransaction.create({
    id: '33333333-3333-4333-8333-333333333333',
    attemptId: 'attempt-1',
    idempotencyKey: 'checkout_identity_1',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'SALE',
    amountCents,
    currency: 'CAD',
    externalPaymentId: 'sq_attempt_1',
    createdAt: new Date('2026-08-26T22:00:00.000Z'),
  }).transitionTo('PROCESSING', new Date('2026-08-26T22:00:01.000Z'));

  if (status === 'PROCESSING') return payment;
  if (status === 'RECONCILING') {
    payment = payment.applyProviderOutcome(
      { status: 'UNKNOWN' },
      new Date('2026-08-26T22:00:02.000Z'),
    );
    return payment.transitionTo(
      'RECONCILING',
      new Date('2026-08-26T22:00:03.000Z'),
    );
  }
  return payment.applyProviderOutcome(
    {
      status,
      ...(status === 'SUCCEEDED' ? canonicalChargeFacts : {}),
    },
    new Date('2026-08-26T22:00:02.000Z'),
  );
};

const createHarness = () => {
  let checkout = checkoutFixture();

  const featureConfig = {
    isEnabled: jest.fn().mockReturnValue(true),
  } as unknown as PosCardPaymentFeatureConfig;
  const checkouts = {
    prepare: jest.fn().mockImplementation(async () => checkout),
    findPosCardPaymentReviewItems: jest.fn().mockResolvedValue([]),
    requireForInput: jest.fn().mockImplementation(async () => checkout),
    findByAttemptId: jest.fn().mockImplementation(async () => checkout),
    claimProviderStart: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'PROCESSING' };
      return { checkout, claimed: true };
    }),
    cancelBeforeProvider: jest.fn().mockImplementation(async () => {
      checkout = {
        ...checkout,
        status: 'CANCELLED',
        benefitsReleasedAt: new Date(),
      };
      return { checkout, cancelled: true };
    }),
    cancelAfterConfirmedNoDispatch: jest.fn().mockImplementation(async () => {
      checkout = {
        ...checkout,
        status: 'CANCELLED',
        benefitsReleasedAt: new Date(),
      };
      return checkout;
    }),
    markSucceededWithoutExternalPayment: jest
      .fn()
      .mockImplementation(async () => {
        checkout = { ...checkout, status: 'SUCCEEDED' };
        return checkout;
      }),
    markFromPayment: jest
      .fn()
      .mockImplementation(async (_attemptId, payment) => {
        checkout = {
          ...checkout,
          status: payment.status,
          paymentTransactionId: payment.id,
        };
        return checkout;
      }),
    markDefinitiveFailureAndRelease: jest
      .fn()
      .mockImplementation(async (_attemptId, status) => {
        checkout = { ...checkout, status, benefitsReleasedAt: new Date() };
        return checkout;
      }),
    markFinalizing: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'FINALIZING' };
      return checkout;
    }),
    markCompleted: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'COMPLETED' };
      return checkout;
    }),
  } as unknown as jest.Mocked<PaymentCheckoutAttemptService>;

  const terminalPayments = {
    getAvailability: jest.fn().mockResolvedValue({
      state: 'READY',
      configured: true,
      available: true,
      terminalId: 'compact-test-1',
      failureCode: null,
      failureMessage: null,
    }),
    startSale: jest.fn().mockResolvedValue(paymentFixture('SUCCEEDED')),
    getTerminalOperationReview: jest.fn().mockResolvedValue(null),
    reserveSale: jest.fn().mockResolvedValue(true),
    requestPendingCancel: jest.fn().mockResolvedValue({
      requested: true,
      safeBeforeDispatch: false,
    }),
    finishTerminalOperation: jest.fn().mockResolvedValue(true),
    completeUndispatchedCancel: jest.fn().mockResolvedValue(false),
    findById: jest.fn(),
    reconcile: jest.fn(),
    resumeOriginal504Sale: jest.fn(),
    canResumeOriginal504Sale: jest.fn().mockReturnValue(false),
    cancel: jest.fn(),
    completeCustomerInteraction: jest.fn().mockResolvedValue(false),
    cancelCustomerConfirmation: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TerminalPaymentService>;

  const sandboxRecovery = {
    isEnabled: jest.fn().mockReturnValue(false),
    getSandboxManualUnpaidDecision: jest.fn().mockResolvedValue(null),
    acceptSandboxManualUnpaid: jest
      .fn()
      .mockResolvedValue(paymentFixture('FAILED')),
    checkpointSandboxBenefitsReleased: jest.fn().mockResolvedValue(undefined),
    finishSandboxManualUnpaid: jest.fn().mockResolvedValue(true),
    inspectSandboxLateCanonicalSuccess: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<SandboxTerminalManualRecoveryService>;

  const paymentTransactions = {
    findByAttemptId: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<PaymentTransactionRepository>;

  const orderFinalization = {
    finalizeConfirmedPayment: jest.fn().mockResolvedValue({
      order: orderDto,
    }),
  } as jest.Mocked<PaymentOrderFinalizationPort>;

  const orderOperations = {
    getByStableIdForStore: jest.fn().mockResolvedValue(orderDto),
    activateImmediatePreparation: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<PosOrderOperationsPort>;

  const paymentRealtime = {
    publishCardPaymentStatus: jest.fn(),
    publishCardPaymentReverseSync: jest.fn(),
  } as jest.Mocked<PosPaymentRealtimePort>;

  const service = new PosCardPaymentOrchestrationService(
    featureConfig,
    checkouts,
    terminalPayments,
    sandboxRecovery,
    paymentTransactions,
    orderFinalization,
    orderOperations,
    paymentRealtime,
  );

  return {
    service,
    featureConfig,
    checkouts,
    terminalPayments,
    sandboxRecovery,
    paymentTransactions,
    orderFinalization,
    orderOperations,
    paymentRealtime,
    setCheckout(next: PreparedPaymentCheckout) {
      checkout = next;
    },
  };
};

describe('PosCardPaymentOrchestrationService', () => {
  it('keeps the new route behind the disabled-by-default feature flag', async () => {
    const harness = createHarness();
    jest.mocked(harness.featureConfig.isEnabled).mockReturnValue(false);

    await expect(
      harness.service.start(storeStableId, {
        attemptId: 'attempt-1',
        idempotencyKey: 'client-idem-1',
        order: orderInput,
      }),
    ).rejects.toMatchObject({
      response: { code: 'POS_CLOVER_TERMINAL_PAYMENT_DISABLED' },
    });
    expect(harness.checkouts.prepare).not.toHaveBeenCalled();
  });

  it('keeps store-scoped read-only review visible when new Terminal payments are disabled', async () => {
    const harness = createHarness();
    jest.mocked(harness.featureConfig.isEnabled).mockReturnValue(false);
    await expect(
      harness.service.getBenefitsReview(storeStableId),
    ).resolves.toEqual({ items: [] });
    expect(
      harness.checkouts.findPosCardPaymentReviewItems,
    ).toHaveBeenCalledWith(storeStableId);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
  });

  it('reads original 504 evidence without Clover access even when Terminal is disabled', async () => {
    const harness = createHarness();
    jest.mocked(harness.featureConfig.isEnabled).mockReturnValue(false);
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    const payment = paymentFixture('RECONCILING').recordProviderObservation({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(payment);
    jest
      .mocked(harness.terminalPayments.getTerminalOperationReview)
      .mockResolvedValue({ terminalId: 'compact-1', state: 'SALE_IN_FLIGHT' });

    await expect(
      harness.service.getReviewAttempt(storeStableId, 'attempt-1'),
    ).resolves.toMatchObject({
      status: 'RECONCILING',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      externalPaymentId: 'sq_attempt_1',
      terminalOperationState: 'SALE_IN_FLIGHT',
      terminalId: 'compact-1',
    });
    expect(harness.terminalPayments.reconcile).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
  });

  it('permits read-only inspection but blocks recheck while Terminal is disabled', async () => {
    const harness = createHarness();
    jest.mocked(harness.featureConfig.isEnabled).mockReturnValue(false);
    await expect(
      harness.service.getReviewAttempt(storeStableId, 'attempt-1'),
    ).resolves.toBeDefined();
    await expect(
      harness.service.recheckReviewAttempt(storeStableId, 'attempt-1'),
    ).rejects.toMatchObject({
      response: { code: 'POS_CLOVER_TERMINAL_PAYMENT_DISABLED' },
    });
    expect(harness.terminalPayments.reconcile).not.toHaveBeenCalled();
  });

  it('rejects review from another Store before consulting Clover', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ storeId: 'other_store' }));
    await expect(
      harness.service.getReviewAttempt(storeStableId, 'attempt-1'),
    ).rejects.toBeDefined();
    await expect(
      harness.service.recheckReviewAttempt(storeStableId, 'attempt-1'),
    ).rejects.toBeDefined();
    expect(harness.terminalPayments.reconcile).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
  });

  it('rechecks 504 + canonical NOT_FOUND without releasing Benefits or creating a Sale', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    const payment = paymentFixture('RECONCILING').recordProviderObservation({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(payment);
    jest.mocked(harness.terminalPayments.reconcile).mockResolvedValue(payment);

    const result = await harness.service.recheckReviewAttempt(
      storeStableId,
      'attempt-1',
    );
    expect(result.status).toBe('RECONCILING');
    expect(result.benefitsReleaseComplete).toBe(false);
    expect(harness.terminalPayments.reconcile).toHaveBeenCalledWith(payment.id);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
  });

  it('finalizes canonical success through the existing path but never starts another Sale', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(paymentFixture('RECONCILING'));
    jest
      .mocked(harness.terminalPayments.reconcile)
      .mockResolvedValue(paymentFixture('SUCCEEDED'));

    const result = await harness.service.recheckReviewAttempt(
      storeStableId,
      'attempt-1',
    );
    expect(result.status).toBe('SUCCEEDED');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
  });

  it('does not try another Sale when the saved payment is missing', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    await expect(
      harness.service.recheckReviewAttempt(storeStableId, 'attempt-1'),
    ).rejects.toMatchObject({
      response: { code: 'POS_CARD_REVIEW_PAYMENT_MISSING' },
    });
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(harness.terminalPayments.reconcile).not.toHaveBeenCalled();
  });

  it('keeps Sandbox manual closure disabled by default without touching finance', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    await expect(
      harness.service.manuallyCloseSandboxUnpaid(
        storeStableId,
        'attempt-1',
        'coperator',
        'J69R16PIHFKYG',
        'Clover test merchant showed No Payments',
      ),
    ).rejects.toMatchObject({
      response: { code: 'POS_SANDBOX_MANUAL_RECOVERY_DISABLED' },
    });
    expect(
      harness.sandboxRecovery.acceptSandboxManualUnpaid,
    ).not.toHaveBeenCalled();
  });

  it('audits a Sandbox operator decision before owner RELEASE and terminal finalization', async () => {
    const harness = createHarness();
    jest.mocked(harness.sandboxRecovery.isEnabled).mockReturnValue(true);
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(paymentFixture('RECONCILING'));

    const result = await harness.service.manuallyCloseSandboxUnpaid(
      storeStableId,
      'attempt-1',
      'coperator',
      'J69R16PIHFKYG',
      'Clover test merchant showed No Payments',
    );
    expect(result.status).toBe('FAILED');
    expect(result.benefitsReleaseComplete).toBe(true);
    expect(result.terminalReadyForNextSale).toBe(true);
    expect(
      harness.sandboxRecovery.acceptSandboxManualUnpaid,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: '33333333-3333-4333-8333-333333333333',
        storeStableId,
        attemptId: 'attempt-1',
        actorUserStableId: 'coperator',
      }),
    );
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).toHaveBeenCalledWith('attempt-1', 'FAILED');
    expect(
      harness.sandboxRecovery.checkpointSandboxBenefitsReleased,
    ).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.sandboxRecovery.finishSandboxManualUnpaid,
    ).toHaveBeenCalledWith('attempt-1', storeStableId);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
  });

  it('keeps a manually decided Sandbox fence non-final after failed Benefits RELEASE', async () => {
    const harness = createHarness();
    jest.mocked(harness.sandboxRecovery.isEnabled).mockReturnValue(true);
    harness.setCheckout(checkoutFixture({ status: 'RECONCILING' }));
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(paymentFixture('RECONCILING'));
    jest
      .mocked(harness.checkouts.markDefinitiveFailureAndRelease)
      .mockRejectedValueOnce(new Error('Benefits owner unavailable'));

    const result = await harness.service.manuallyCloseSandboxUnpaid(
      storeStableId,
      'attempt-1',
      'coperator',
      'J69R16PIHFKYG',
      'Clover test merchant showed No Payments',
    );
    expect(result.status).toBe('FAILED');
    expect(result.benefitsReleaseComplete).toBe(false);
    expect(result.terminalReadyForNextSale).toBe(false);
    expect(
      harness.sandboxRecovery.checkpointSandboxBenefitsReleased,
    ).not.toHaveBeenCalled();
    expect(
      harness.sandboxRecovery.finishSandboxManualUnpaid,
    ).not.toHaveBeenCalled();
  });

  it('refuses a cross-Store manual closure before claiming the original payment', async () => {
    const harness = createHarness();
    jest.mocked(harness.sandboxRecovery.isEnabled).mockReturnValue(true);
    harness.setCheckout(
      checkoutFixture({
        storeId: 'another_store',
        status: 'RECONCILING',
      }),
    );
    await expect(
      harness.service.manuallyCloseSandboxUnpaid(
        storeStableId,
        'attempt-1',
        'coperator',
        'J69R16PIHFKYG',
        'Clover test merchant showed No Payments',
      ),
    ).rejects.toBeDefined();
    expect(
      harness.sandboxRecovery.acceptSandboxManualUnpaid,
    ).not.toHaveBeenCalled();
  });

  it('acknowledges an async Sale immediately and publishes the canonical result later', async () => {
    const harness = createHarness();
    let completeSale!: (payment: PaymentTransaction) => void;
    const waitingForCard = new Promise<PaymentTransaction>((resolve) => {
      completeSale = resolve;
    });
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockReturnValue(waitingForCard);

    const accepted = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      asyncTerminalFlow: true,
      retryPromptEnabled: true,
      order: orderInput,
    });

    expect(accepted).toMatchObject({
      status: 'PROCESSING',
      orderStableId: null,
    });
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    completeSale(paymentFixture('SUCCEEDED'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).toHaveBeenCalledWith('SUCCEEDED');
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        status: 'SUCCEEDED',
        orderStableId: 'cpaymentorder1',
      }),
    );
  });

  it('charges only the external remainder for points + balance + card', async () => {
    const harness = createHarness();

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.checkouts.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: storeStableId }),
    );
    expect(harness.checkouts.prepare).not.toHaveBeenCalledWith(
      expect.objectContaining({ storeId: storeDbId }),
    );
    expect(harness.terminalPayments.startSale).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      idempotencyKey: 'checkout_identity_1',
      amountCents: 700,
      currency: 'CAD',
      description: 'SanQ POS card sale',
    });
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        storeStableId,
        tender: expect.objectContaining({
          pointsCents: 200,
          balanceCents: 300,
          externalCents: 700,
        }),
      }),
      expect.objectContaining({
        attemptId: 'attempt-1',
        cardSurchargeCents: 20,
        chargedTotalCents: 720,
      }),
    );
    const finalizationInput =
      harness.orderFinalization.finalizeConfirmedPayment.mock.calls[0]?.[1];
    expect(finalizationInput).not.toHaveProperty('internalOrderId');
    expect(harness.checkouts.markCompleted).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).toHaveBeenCalledWith('SUCCEEDED');
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenCalledWith('cpaymentorder1', storeStableId);
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).not.toHaveBeenCalledWith('cpaymentorder1', storeDbId);
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        status: 'SUCCEEDED',
        externalAmountCents: 700,
        surchargeCents: 20,
        chargedTotalCents: 720,
        pointsCents: 200,
        balanceCents: 300,
      }),
    );
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).not.toHaveBeenCalledWith(storeDbId, expect.anything());
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      externalAmountCents: 700,
      pointsCents: 200,
      balanceCents: 300,
      orderStableId: 'cpaymentorder1',
    });
  });

  it('accepts canonical charged total with non-surcharge additional charges without re-deriving Clover ledger', async () => {
    const harness = createHarness();
    jest.mocked(harness.terminalPayments.startSale).mockResolvedValue(
      paymentFixture('SUCCEEDED', 700, {
        surchargeCents: 20,
        chargedTotalCents: 735,
      }),
    );

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cardSurchargeCents: 20,
        chargedTotalCents: 735,
      }),
    );
    expect(result.status).toBe('SUCCEEDED');
  });

  it('finalizes a 100% internal tender without checking or calling Clover', async () => {
    const harness = createHarness();
    harness.setCheckout(
      checkoutFixture({
        externalAmountCents: 0,
        snapshot: {
          ...checkoutFixture().snapshot,
          tender: {
            pointsCents: 700,
            balanceCents: 300,
            couponDiscountCents: 100,
            orderTotalCents: 1000,
            externalCents: 0,
          },
        },
      }),
    );

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.terminalPayments.getAvailability).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cardSurchargeCents: 0,
        chargedTotalCents: 0,
      }),
    );
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenCalledWith('cpaymentorder1', storeStableId);
    expect(result.status).toBe('SUCCEEDED');
  });

  it('releases reservations on a definitive decline and never creates an order', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('DECLINED'));

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).toHaveBeenCalledWith('attempt-1', 'DECLINED');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe('DECLINED');
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).toHaveBeenCalledWith('DECLINED', null, false);
  });

  it('relays a device-confirmed Retry only after a definitive failed payment', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('DECLINED'));
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockResolvedValue(true);

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: true,
      order: orderInput,
    });

    expect(result).toMatchObject({
      status: 'DECLINED',
      customerPromptPending: true,
      orderStableId: null,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        status: 'DECLINED',
        customerPromptPending: false,
        customerRetryRequested: true,
        benefitsReleaseComplete: true,
        terminalReadyForNextSale: true,
      }),
    );
    expect(harness.checkouts.findByAttemptId).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).toHaveBeenCalledTimes(1);
  });

  it.each(['DECLINED', 'FAILED'] as const)(
    'keeps %s Retry and terminal fence blocked when Benefits RELEASE fails',
    async (status) => {
      const harness = createHarness();
      jest
        .mocked(harness.terminalPayments.startSale)
        .mockResolvedValue(paymentFixture(status));
      jest
        .mocked(harness.terminalPayments.completeCustomerInteraction)
        .mockResolvedValue(true);
      jest
        .mocked(harness.checkouts.markDefinitiveFailureAndRelease)
        .mockRejectedValueOnce(new Error('coupon release unavailable'));

      const result = await harness.service.start(storeStableId, {
        attemptId: 'attempt-1',
        idempotencyKey: 'client-idem-1',
        retryPromptEnabled: true,
        order: orderInput,
      });
      expect(result.benefitsReleaseComplete).toBe(false);
      expect(result.customerPromptPending).toBe(true);
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(
        harness.paymentRealtime.publishCardPaymentStatus,
      ).toHaveBeenCalledWith(
        storeStableId,
        expect.objectContaining({
          status,
          customerPromptPending: false,
          customerRetryRequested: false,
          terminalReadyForNextSale: false,
        }),
      );
      expect(
        harness.terminalPayments.finishTerminalOperation,
      ).not.toHaveBeenCalled();
      expect(
        harness.orderFinalization.finalizeConfirmedPayment,
      ).not.toHaveBeenCalled();
      expect(harness.terminalPayments.startSale).toHaveBeenCalledTimes(1);
    },
  );

  it('does not send Web Retry when the released checkout still has an unready terminal', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('DECLINED'));
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockResolvedValue(true);
    jest
      .mocked(harness.terminalPayments.finishTerminalOperation)
      .mockResolvedValue(false);

    await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: true,
      order: orderInput,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).not.toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({ customerRetryRequested: true }),
    );
    expect(harness.terminalPayments.startSale).toHaveBeenCalledTimes(1);
  });

  it('re-reads a completed RELEASE checkpoint before allowing the device Retry', async () => {
    const harness = createHarness();
    const declined = paymentFixture('DECLINED');
    jest.mocked(harness.terminalPayments.startSale).mockResolvedValue(declined);
    jest
      .mocked(harness.checkouts.markDefinitiveFailureAndRelease)
      .mockRejectedValueOnce(new Error('temporary tender release failure'));
    let finishPrompt!: (retry: boolean) => void;
    const pendingPrompt = new Promise<boolean>((resolve) => {
      finishPrompt = resolve;
    });
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockReturnValue(pendingPrompt);

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: true,
      order: orderInput,
    });
    expect(result.benefitsReleaseComplete).toBe(false);

    // The existing Benefits recovery worker may finish after the first failed
    // release; the prompt completion must consult its durable checkpoint.
    harness.setCheckout(
      checkoutFixture({
        status: 'DECLINED',
        paymentTransactionId: declined.id,
        benefitsReleasedAt: new Date(),
      }),
    );
    finishPrompt(true);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        customerRetryRequested: true,
        benefitsReleaseComplete: true,
        terminalReadyForNextSale: true,
      }),
    );
  });

  it('does not finalize the terminal when the released Checkout belongs to another Payment', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('DECLINED'));
    let finishPrompt!: (retry: boolean) => void;
    const pendingPrompt = new Promise<boolean>((resolve) => {
      finishPrompt = resolve;
    });
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockReturnValue(pendingPrompt);

    await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: true,
      order: orderInput,
    });
    harness.setCheckout(
      checkoutFixture({
        status: 'DECLINED',
        paymentTransactionId: '44444444-4444-4444-8444-444444444444',
        benefitsReleasedAt: new Date(),
      }),
    );
    finishPrompt(true);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).not.toHaveBeenCalled();
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).not.toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({ customerRetryRequested: true }),
    );
  });

  it('stops a pending customer prompt on POS Cancel without cancelling an already failed payment', async () => {
    const harness = createHarness();
    const declined = paymentFixture('DECLINED');
    jest.mocked(harness.terminalPayments.startSale).mockResolvedValue(declined);
    jest.mocked(harness.terminalPayments.findById).mockResolvedValue(declined);
    let finishPrompt!: (retry: boolean) => void;
    const pendingConfirmation = new Promise<boolean>((resolve) => {
      finishPrompt = resolve;
    });
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockReturnValue(pendingConfirmation);

    const input = {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: true,
      order: orderInput,
    };
    const waiting = await harness.service.start(storeStableId, input);
    expect(waiting).toMatchObject({
      status: 'DECLINED',
      customerPromptPending: true,
    });

    const cancelling = await harness.service.cancel(storeStableId, input);
    expect(cancelling).toMatchObject({
      status: 'DECLINED',
      customerPromptPending: true,
    });
    expect(
      harness.terminalPayments.cancelCustomerConfirmation,
    ).toHaveBeenCalledTimes(1);
    expect(harness.terminalPayments.cancel).not.toHaveBeenCalled();

    finishPrompt(false);
    await Promise.resolve();
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        status: 'DECLINED',
        customerPromptPending: false,
        customerRetryRequested: false,
      }),
    );
  });

  it('suppresses a device Retry prompt when it is disabled by the caller', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('FAILED'));
    jest
      .mocked(harness.terminalPayments.completeCustomerInteraction)
      .mockResolvedValue(true);

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      retryPromptEnabled: false,
      order: orderInput,
    });

    expect(result.customerRetryRequested).not.toBe(true);
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).toHaveBeenCalledWith('FAILED', null, false);
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
  });

  it('publishes a read-only timeout UI hint without cancelling payment or releasing benefits', async () => {
    const harness = createHarness();
    const timedOut = paymentFixture('RECONCILING').recordProviderObservation({
      status: 'RECONCILING',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    jest.mocked(harness.terminalPayments.startSale).mockResolvedValue(timedOut);
    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(result).toMatchObject({
      status: 'RECONCILING',
      terminalInteractionTimedOut: true,
    });
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.cancel).not.toHaveBeenCalled();
  });

  it('keeps reservations held when the provider result is UNKNOWN', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('UNKNOWN'));

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe('UNKNOWN');
    expect(
      harness.terminalPayments.completeCustomerInteraction,
    ).not.toHaveBeenCalled();
  });

  it('offers only a one-time original-504 resume and finalizes its later confirmed success', async () => {
    const harness = createHarness();
    const unknown = paymentFixture('UNKNOWN').recordProviderObservation({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    harness.setCheckout(
      checkoutFixture({
        status: 'UNKNOWN',
        paymentTransactionId: unknown.id,
      }),
    );
    jest.mocked(harness.terminalPayments.findById).mockResolvedValue(unknown);
    jest
      .mocked(harness.terminalPayments.canResumeOriginal504Sale)
      .mockReturnValue(true);
    let finishResume!: (payment: PaymentTransaction) => void;
    jest.mocked(harness.terminalPayments.resumeOriginal504Sale).mockReturnValue(
      new Promise<PaymentTransaction>((resolve) => {
        finishResume = resolve;
      }),
    );
    const input = {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    };
    const accepted = await harness.service.resumeOriginalSale(
      storeStableId,
      input,
    );
    expect(accepted).toMatchObject({
      status: 'RECONCILING',
      canResumeOriginalSale: false,
      orderStableId: null,
    });
    await harness.service.resumeOriginalSale(storeStableId, input);
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).toHaveBeenCalledTimes(1);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();

    await Promise.resolve();
    finishResume(paymentFixture('SUCCEEDED'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.paymentRealtime.publishCardPaymentStatus,
    ).toHaveBeenCalledWith(
      storeStableId,
      expect.objectContaining({
        status: 'SUCCEEDED',
        orderStableId: 'cpaymentorder1',
      }),
    );
  });

  it('never resumes a generic UNKNOWN without the original 504 evidence', async () => {
    const harness = createHarness();
    const unknown = paymentFixture('UNKNOWN');
    harness.setCheckout(
      checkoutFixture({
        status: 'UNKNOWN',
        paymentTransactionId: unknown.id,
      }),
    );
    jest.mocked(harness.terminalPayments.findById).mockResolvedValue(unknown);
    const view = await harness.service.resumeOriginalSale(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(view).toMatchObject({
      status: 'UNKNOWN',
      canResumeOriginalSale: false,
    });
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
  });

  it('recovers UNKNOWN by reconciliation without a second sale', async () => {
    const harness = createHarness();
    const unknown = paymentFixture('UNKNOWN');
    harness.setCheckout(
      checkoutFixture({
        status: 'UNKNOWN',
        paymentTransactionId: unknown.id,
      }),
    );
    jest.mocked(harness.terminalPayments.findById).mockResolvedValue(unknown);
    jest
      .mocked(harness.terminalPayments.reconcile)
      .mockResolvedValue(paymentFixture('SUCCEEDED'));

    const result = await harness.service.recover(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.terminalPayments.reconcile).toHaveBeenCalledWith(unknown.id);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
  });

  it('recovers a claimed uncertain payment after a browser/API restart without new Sale or premature release', async () => {
    const harness = createHarness();
    const claimed = paymentFixture('RECONCILING').recordProviderObservation({
      status: 'RECONCILING',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    harness.setCheckout(
      checkoutFixture({
        status: 'RECONCILING',
        paymentTransactionId: claimed.id,
      }),
    );
    jest.mocked(harness.terminalPayments.findById).mockResolvedValue(claimed);
    jest
      .mocked(harness.terminalPayments.reconcile)
      .mockResolvedValueOnce(claimed)
      .mockResolvedValueOnce(paymentFixture('SUCCEEDED'));

    const originalRequest = {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    };
    const unresolved = await harness.service.recover(
      storeStableId,
      originalRequest,
    );
    expect(unresolved.status).toBe('RECONCILING');
    expect(harness.terminalPayments.reconcile).toHaveBeenCalledWith(claimed.id);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();

    // A later canonical result is applied on the same frozen checkout;
    // repeated browser RECOVER does not dispatch another Compact Sale.
    const settled = await harness.service.recover(
      storeStableId,
      originalRequest,
    );
    expect(settled.status).toBe('SUCCEEDED');
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.terminalPayments.resumeOriginal504Sale,
    ).not.toHaveBeenCalled();
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenCalledWith('cpaymentorder1', storeStableId);

    const completed = await harness.service.recover(
      storeStableId,
      originalRequest,
    );
    expect(completed.status).toBe('SUCCEEDED');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
  });

  it('reloads an already-completed checkout without repricing or recreating the order', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'COMPLETED' }));

    const result = await harness.service.recover(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.orderOperations.getByStableIdForStore).toHaveBeenCalledWith(
      'cpaymentorder1',
      storeStableId,
    );
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
  });

  it('cancels a PREPARED checkout locally before any provider charge starts', async () => {
    const harness = createHarness();

    const result = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.checkouts.cancelBeforeProvider).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.terminalPayments.cancel).not.toHaveBeenCalled();
    expect(result.status).toBe('CANCELLED');
  });

  it('does not release a PROCESSING checkout if the provider attempt is not visible yet', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'PROCESSING' }));

    const result = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.cancel).not.toHaveBeenCalled();
    expect(result.status).toBe('PROCESSING');
  });

  it('does not create an Order if reverse sync wins the SUCCEEDED -> FINALIZING checkout CAS', async () => {
    const harness = createHarness();
    jest.mocked(harness.checkouts.markFinalizing).mockResolvedValue(
      checkoutFixture({
        status: 'CANCELLED',
        paymentTransactionId: '33333333-3333-4333-8333-333333333333',
      }),
    );

    const result = await harness.service.start(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe('CANCELLED');
  });

  it('allows provider reverse sync to finish an already-started payment even after the feature flag is disabled', async () => {
    const harness = createHarness();
    jest.mocked(harness.featureConfig.isEnabled).mockReturnValue(false);
    harness.setCheckout(
      checkoutFixture({
        status: 'PROCESSING',
        paymentTransactionId: '33333333-3333-4333-8333-333333333333',
      }),
    );

    const result = await harness.service.applyReverseSyncedPayment(
      paymentFixture('SUCCEEDED'),
    );

    expect(result?.status).toBe('SUCCEEDED');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).toHaveBeenCalledTimes(1);
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenCalledWith('cpaymentorder1', storeStableId);
    expect(harness.featureConfig.isEnabled).not.toHaveBeenCalled();
  });

  it('replays only the idempotent durable preparation command across duplicate finalization', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'COMPLETED' }));

    await harness.service.recover(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    await harness.service.recover(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenNthCalledWith(1, 'cpaymentorder1', storeStableId);
    expect(
      harness.orderOperations.activateImmediatePreparation,
    ).toHaveBeenNthCalledWith(2, 'cpaymentorder1', storeStableId);
  });

  it('persists operator cancellation while checkout is PROCESSING before payment creation', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'PROCESSING' }));
    const view = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(harness.terminalPayments.requestPendingCancel).toHaveBeenCalledWith(
      'attempt-1',
      storeStableId,
    );
    expect(view.status).toBe('PROCESSING');
    expect(view.cancellationPending).toBe(true);
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
  });

  it('safely closes a PROCESSING checkout if durable fencing proves the Sale was never sent', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'PROCESSING' }));
    jest
      .mocked(harness.terminalPayments.requestPendingCancel)
      .mockResolvedValue({
        requested: true,
        safeBeforeDispatch: true,
      });
    jest
      .mocked(harness.terminalPayments.completeUndispatchedCancel)
      .mockResolvedValue(true);
    const view = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(view.status).toBe('CANCELLED');
    expect(view.benefitsReleaseComplete).toBe(true);
    expect(view.terminalReadyForNextSale).toBe(true);
    expect(
      harness.checkouts.cancelAfterConfirmedNoDispatch,
    ).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.terminalPayments.completeUndispatchedCancel,
    ).toHaveBeenCalledWith('attempt-1');
    expect(harness.terminalPayments.cancel).not.toHaveBeenCalled();
  });

  it('completes checkout RELEASE and Welcome after an original Sale final cancellation', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'PROCESSING' }));
    const payment = paymentFixture('CANCELLED');
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(payment);
    jest.mocked(harness.terminalPayments.cancel).mockResolvedValue(payment);
    const view = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(view.status).toBe('CANCELLED');
    expect(view.benefitsReleaseComplete).toBe(true);
    expect(view.terminalReadyForNextSale).toBe(true);
    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).toHaveBeenCalledWith('attempt-1', 'CANCELLED');
    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).toHaveBeenCalledWith('attempt-1');
    expect(
      harness.orderFinalization.finalizeConfirmedPayment,
    ).not.toHaveBeenCalled();
  });

  it('keeps POS locked when a Benefits owner RELEASE has not checkpointed', async () => {
    const harness = createHarness();
    harness.setCheckout(checkoutFixture({ status: 'PROCESSING' }));
    const payment = paymentFixture('CANCELLED');
    jest
      .mocked(harness.paymentTransactions.findByAttemptId)
      .mockResolvedValue(payment);
    jest.mocked(harness.terminalPayments.cancel).mockResolvedValue(payment);
    jest
      .mocked(harness.checkouts.markDefinitiveFailureAndRelease)
      .mockRejectedValueOnce(
        new Error('coupon release temporarily unavailable'),
      );
    const view = await harness.service.cancel(storeStableId, {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    expect(view.status).toBe('CANCELLED');
    expect(view.benefitsReleaseComplete).toBe(false);
    expect(view.terminalReadyForNextSale).toBe(false);
    expect(
      harness.terminalPayments.finishTerminalOperation,
    ).not.toHaveBeenCalled();
  });
});
