/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import type { CreateOrderInput } from '@shared/order';

import type { OrderDto } from '../orders/dto/order.dto';
import type { OrdersService } from '../orders/orders.service';
import type { PrintPosPayloadService } from '../orders/print-pos-payload.service';
import type { TerminalPaymentService } from '../payments/application/create-payment-attempt.use-case';
import type { PaymentTransactionRepository } from '../payments/application/payment-transaction.repository';
import { PaymentTransaction } from '../payments/domain/payment-transaction';
import type { PosCardPaymentFeatureConfig } from '../pos/pos-card-payment-feature.config';
import type { PosGateway } from '../pos/pos.gateway';
import type {
  PaymentCheckoutAttemptService,
  PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

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
} as OrderDto;

const checkoutFixture = (
  overrides: Partial<PreparedPaymentCheckout> = {},
): PreparedPaymentCheckout => ({
  id: 'checkout-row-1',
  attemptId: 'attempt-1',
  idempotencyKey: 'checkout_identity_1',
  source: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  storeId: 'store-1',
  status: 'PREPARED',
  externalAmountCents: 700,
  paymentTransactionId: null,
  plannedOrderId: '11111111-1111-4111-8111-111111111111',
  orderId: null,
  orderStableId: 'cpaymentorder1',
  expiresAt: new Date('2026-08-26T23:00:00.000Z'),
  snapshot: {
    version: 1,
    order: orderInput,
    userId: '22222222-2222-4222-8222-222222222222',
    storeId: 'store-1',
    pricing: {
      subtotalCents: 1200,
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
      ...(status === 'SUCCEEDED'
        ? { surchargeCents: 20, chargedTotalCents: amountCents + 20 }
        : {}),
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
    requireForInput: jest.fn().mockImplementation(async () => checkout),
    claimProviderStart: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'PROCESSING' };
      return { checkout, claimed: true };
    }),
    cancelBeforeProvider: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'CANCELLED' };
      return { checkout, cancelled: true };
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
        checkout = { ...checkout, status };
        return checkout;
      }),
    markFinalizing: jest.fn().mockImplementation(async () => {
      checkout = { ...checkout, status: 'FINALIZING' };
      return checkout;
    }),
    markCompleted: jest.fn().mockImplementation(async ({ orderId }) => {
      checkout = { ...checkout, status: 'COMPLETED', orderId };
      return checkout;
    }),
  } as unknown as jest.Mocked<PaymentCheckoutAttemptService>;

  const terminalPayments = {
    getAvailability: jest.fn().mockResolvedValue({
      state: 'READY',
      configured: true,
      available: true,
      failureCode: null,
      failureMessage: null,
    }),
    startSale: jest.fn().mockResolvedValue(paymentFixture('SUCCEEDED')),
    findById: jest.fn(),
    reconcile: jest.fn(),
    cancel: jest.fn(),
  } as unknown as jest.Mocked<TerminalPaymentService>;

  const paymentTransactions = {
    findByAttemptId: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<PaymentTransactionRepository>;

  const orders = {
    createFromConfirmedPaymentSnapshot: jest.fn().mockResolvedValue({
      order: orderDto,
      internalOrderId: '11111111-1111-4111-8111-111111111111',
    }),
    getByStableId: jest.fn().mockResolvedValue(orderDto),
  } as unknown as jest.Mocked<OrdersService>;

  const printPosPayloadService = {
    getByStableId: jest.fn().mockResolvedValue({ order: {} }),
  } as unknown as jest.Mocked<PrintPosPayloadService>;

  const posGateway = {
    sendPrintJob: jest.fn().mockResolvedValue({}),
    publishCardPaymentStatus: jest.fn(),
  } as unknown as jest.Mocked<PosGateway>;

  const service = new PosCardPaymentOrchestrationService(
    featureConfig,
    checkouts,
    terminalPayments,
    paymentTransactions,
    orders,
    printPosPayloadService,
    posGateway,
  );

  return {
    service,
    featureConfig,
    checkouts,
    terminalPayments,
    paymentTransactions,
    orders,
    printPosPayloadService,
    posGateway,
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
      harness.service.start('store-1', {
        attemptId: 'attempt-1',
        idempotencyKey: 'client-idem-1',
        order: orderInput,
      }),
    ).rejects.toMatchObject({
      response: { code: 'POS_CLOVER_TERMINAL_PAYMENT_DISABLED' },
    });
    expect(harness.checkouts.prepare).not.toHaveBeenCalled();
  });

  it('charges only the external remainder for points + balance + card', async () => {
    const harness = createHarness();

    const result = await harness.service.start('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.terminalPayments.startSale).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      idempotencyKey: 'checkout_identity_1',
      amountCents: 700,
      currency: 'CAD',
      description: 'SanQ POS card sale',
    });
    expect(
      harness.orders.createFromConfirmedPaymentSnapshot,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
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
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      externalAmountCents: 700,
      pointsCents: 200,
      balanceCents: 300,
      orderStableId: 'cpaymentorder1',
    });
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

    const result = await harness.service.start('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.terminalPayments.getAvailability).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(
      harness.orders.createFromConfirmedPaymentSnapshot,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cardSurchargeCents: 0,
        chargedTotalCents: 0,
      }),
    );
    expect(result.status).toBe('SUCCEEDED');
  });

  it('releases reservations on a definitive decline and never creates an order', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('DECLINED'));

    const result = await harness.service.start('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).toHaveBeenCalledWith('attempt-1', 'DECLINED');
    expect(
      harness.orders.createFromConfirmedPaymentSnapshot,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe('DECLINED');
  });

  it('keeps reservations held when the provider result is UNKNOWN', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.terminalPayments.startSale)
      .mockResolvedValue(paymentFixture('UNKNOWN'));

    const result = await harness.service.start('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(
      harness.checkouts.markDefinitiveFailureAndRelease,
    ).not.toHaveBeenCalled();
    expect(
      harness.orders.createFromConfirmedPaymentSnapshot,
    ).not.toHaveBeenCalled();
    expect(result.status).toBe('UNKNOWN');
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

    const result = await harness.service.recover('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.terminalPayments.reconcile).toHaveBeenCalledWith(unknown.id);
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
  });

  it('reloads an already-completed checkout without repricing or recreating the order', async () => {
    const harness = createHarness();
    harness.setCheckout(
      checkoutFixture({
        status: 'COMPLETED',
        orderId: '11111111-1111-4111-8111-111111111111',
      }),
    );

    const result = await harness.service.recover('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.orders.getByStableId).toHaveBeenCalledWith('cpaymentorder1');
    expect(
      harness.orders.createFromConfirmedPaymentSnapshot,
    ).not.toHaveBeenCalled();
    expect(harness.terminalPayments.startSale).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCEEDED');
  });

  it('cancels a PREPARED checkout locally before any provider charge starts', async () => {
    const harness = createHarness();

    const result = await harness.service.cancel('store-1', {
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

    const result = await harness.service.cancel('store-1', {
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

  it('uses one deterministic print business key across duplicate finalization', async () => {
    const harness = createHarness();
    harness.setCheckout(
      checkoutFixture({
        status: 'COMPLETED',
        orderId: '11111111-1111-4111-8111-111111111111',
      }),
    );

    await harness.service.recover('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });
    await harness.service.recover('store-1', {
      attemptId: 'attempt-1',
      idempotencyKey: 'client-idem-1',
      order: orderInput,
    });

    expect(harness.posGateway.sendPrintJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'PAYMENT_CHECKOUT:attempt-1' }),
    );
    expect(harness.posGateway.sendPrintJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'PAYMENT_CHECKOUT:attempt-1' }),
    );
  });
});
