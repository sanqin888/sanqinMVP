import { PaymentMethod } from '@prisma/client';
import { createHash } from 'node:crypto';

import type { PosOrderDto, PosOrderOperationsPort } from '../orders/public-api';
import { PaymentTransaction } from '../payments/domain/payment-transaction';
import type { PaymentTransactionRepository } from '../payments/application/payment-transaction.repository';
import type { RefundPaymentService } from '../payments/application/refund-payment.service';
import type {
  PaymentCheckoutAttemptService,
  PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';

const order = (overrides: Partial<PosOrderDto> = {}): PosOrderDto => ({
  orderStableId: 'order_stable_1',
  orderNumber: '1001',
  clientRequestId: '1001',
  status: 'paid',
  channel: 'in_store',
  fulfillmentType: 'pickup',
  paymentMethod: PaymentMethod.CARD,
  pickupCode: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  deliveryType: null,
  deliveryProvider: null,
  deliveryEtaMinMinutes: null,
  deliveryEtaMaxMinutes: null,
  subtotalCents: 1800,
  taxCents: 200,
  deliveryFeeCents: 0,
  deliveryCostCents: null,
  deliverySubsidyCents: null,
  totalCents: 2000,
  couponCodeSnapshot: null,
  couponTitleSnapshot: null,
  couponDiscountCents: 0,
  loyaltyRedeemCents: 500,
  balancePaidCents: 0,
  pointsEarned: 0,
  createdAt: new Date().toISOString(),
  paidAt: new Date().toISOString(),
  items: [],
  ...overrides,
});

const checkout = (): PreparedPaymentCheckout =>
  ({
    id: '33333333-3333-4333-8333-333333333333',
    attemptId: 'sale-attempt-1',
    idempotencyKey: 'sale-idempotency-1',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    storeId: '4750_Yonge_Street',
    status: 'COMPLETED',
    externalAmountCents: 1500,
    paymentTransactionId: '11111111-1111-4111-8111-111111111111',
    orderStableId: 'order_stable_1',
    expiresAt: new Date(Date.now() + 60_000),
    snapshot: {},
  }) as PreparedPaymentCheckout;

const successfulSale = (): PaymentTransaction =>
  PaymentTransaction.create({
    id: '11111111-1111-4111-8111-111111111111',
    attemptId: 'sale-attempt-1',
    idempotencyKey: 'sale-idempotency-1',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'SALE',
    amountCents: 1500,
    currency: 'CAD',
    externalPaymentId: 'sq-sale-1',
  })
    .transitionTo('PROCESSING')
    .applyProviderOutcome({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
      tipCents: 300,
      surchargeCents: 36,
      chargedTotalCents: 1836,
      refundedAmountCents: 0,
    });

const reversal = (status: 'SUCCEEDED' | 'UNKNOWN'): PaymentTransaction => {
  let transaction = PaymentTransaction.create({
    id: '55555555-5555-4555-8555-555555555555',
    attemptId: 'refund-attempt-1',
    idempotencyKey: 'refund-idempotency-1',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'VOID',
    amountCents: 1500,
    currency: 'CAD',
  }).transitionTo('PROCESSING');
  transaction = transaction.applyProviderOutcome(
    status === 'SUCCEEDED'
      ? {
          status: 'SUCCEEDED',
          providerPaymentId: 'clover-payment-1',
          providerRefundId: 'clover-refund-1',
          refundedAmountCents: 1500,
          tipCents: 300,
          surchargeCents: 36,
          chargedTotalCents: 1836,
        }
      : {
          status: 'UNKNOWN',
          providerPaymentId: 'clover-payment-1',
          failureCode: 'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
          failureMessage: 'not visible yet',
        },
  );
  return transaction;
};

const failedReversal = (): PaymentTransaction =>
  PaymentTransaction.create({
    id: '66666666-6666-4666-8666-666666666666',
    attemptId: 'failed-refund-attempt-1',
    idempotencyKey: 'failed-refund-idempotency-1',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'VOID',
    amountCents: 1500,
    currency: 'CAD',
  })
    .transitionTo('PROCESSING')
    .applyProviderOutcome({
      status: 'FAILED',
      providerPaymentId: 'clover-payment-1',
      failureCode: 'CLOVER_VOID_REJECTED',
      failureMessage: 'void was rejected',
    });

const createHarness = () => {
  const checkouts = {
    findByOrderStableId: jest.fn(),
  };
  const startOrRecover: jest.MockedFunction<
    RefundPaymentService['startOrRecover']
  > = jest.fn();
  const refunds = { startOrRecover };
  const transactions = {
    findById: jest.fn(),
    findByAttemptId: jest.fn(),
  };
  const orders = {
    getByStableIdForStore: jest.fn(),
    createFullRefund: jest.fn(),
  };
  const service = new PosCardRefundOrchestrationService(
    checkouts as unknown as PaymentCheckoutAttemptService,
    refunds as unknown as RefundPaymentService,
    transactions as unknown as PaymentTransactionRepository,
    orders as unknown as PosOrderOperationsPort,
  );
  return { checkouts, refunds, transactions, orders, service };
};

describe('PosCardRefundOrchestrationService', () => {
  it('refunds only the external card tender through Clover, then finalizes the whole mixed-tender order', async () => {
    const harness = createHarness();
    const currentOrder = order();
    const refundedOrder = order({ status: 'refunded' });
    harness.orders.getByStableIdForStore.mockResolvedValue(currentOrder);
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
    harness.transactions.findById.mockResolvedValue(successfulSale());
    harness.transactions.findByAttemptId.mockResolvedValue(null);
    harness.refunds.startOrRecover.mockResolvedValue(reversal('SUCCEEDED'));
    harness.orders.createFullRefund.mockResolvedValue({
      order: refundedOrder,
      outcome: 'refunded',
    });

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
        originalPaymentMethod: PaymentMethod.CARD,
        refundAmountCents: 2000,
      }),
    ).resolves.toMatchObject({
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation: 'VOID',
      order: { status: 'refunded' },
      refundedCardBaseCents: 1500,
      refundedTipCents: 300,
      refundedAdditionalChargeCents: 36,
      refundedCustomerTotalCents: 1836,
    });

    expect(harness.refunds.startOrRecover).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 1500,
        expectedTipRefundCents: 300,
        expectedAdditionalChargeRefundCents: 36,
        originalProviderPaymentId: 'clover-payment-1',
      }),
    );
    expect(harness.orders.createFullRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_1',
        refundAmountCents: 2000,
        originalPaymentMethod: PaymentMethod.CARD,
        refundMethod: PaymentMethod.CARD,
      }),
    );
  });

  it('finalizes a unified CARD checkout with zero external tender without calling Clover', async () => {
    const harness = createHarness();
    const currentOrder = order({ loyaltyRedeemCents: 2000 });
    const refundedOrder = order({
      status: 'refunded',
      loyaltyRedeemCents: 2000,
    });
    harness.orders.getByStableIdForStore.mockResolvedValue(currentOrder);
    harness.checkouts.findByOrderStableId.mockResolvedValue({
      ...checkout(),
      externalAmountCents: 0,
      paymentTransactionId: null,
    });
    harness.orders.createFullRefund.mockResolvedValue({
      order: refundedOrder,
      outcome: 'refunded',
    });

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
        originalPaymentMethod: PaymentMethod.CARD,
        refundAmountCents: 2000,
      }),
    ).resolves.toMatchObject({
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation: null,
      order: { status: 'refunded' },
      refundedCardBaseCents: 0,
      refundedAdditionalChargeCents: 0,
      refundedCustomerTotalCents: 0,
    });
    expect(harness.refunds.startOrRecover).not.toHaveBeenCalled();
    expect(harness.transactions.findById).not.toHaveBeenCalled();
    expect(harness.orders.createFullRefund).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ageMs: -1, operation: 'REFUND' },
    { ageMs: 0, operation: 'VOID' },
    { ageMs: 1_499_999, operation: 'VOID' },
    { ageMs: 1_500_000, operation: 'VOID' },
    { ageMs: 1_500_001, operation: 'REFUND' },
    { ageMs: null, operation: 'REFUND' },
  ])(
    'selects the full-reversal route at the completedAt boundary: %p',
    async ({ ageMs, operation }) => {
      const now = Date.parse('2026-10-20T15:00:00.000Z');
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const harness = createHarness();
        const sale = PaymentTransaction.restore({
          ...successfulSale().toSnapshot(),
          completedAt: ageMs === null ? null : new Date(now - ageMs),
        });
        harness.orders.getByStableIdForStore.mockResolvedValue(order());
        harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
        harness.transactions.findById.mockResolvedValue(sale);
        harness.transactions.findByAttemptId.mockResolvedValue(null);
        harness.refunds.startOrRecover.mockResolvedValue(reversal('UNKNOWN'));
        clock.mockClear();
        await harness.service.refundFullOrder(
          '4750_Yonge_Street',
          'order_stable_1',
          {
            reason: 'Boundary audit',
            operatorName: 'Staff',
            refundMethod: PaymentMethod.CARD,
          },
        );
        expect(harness.refunds.startOrRecover).toHaveBeenCalledWith(
          expect.objectContaining({ operation }),
        );
        expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
        expect(clock).toHaveBeenCalledTimes(ageMs === null ? 0 : 1);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it('recovers the same UNKNOWN VOID beyond the window with the same financial identity', async () => {
    const digest = createHash('sha256')
      .update('pos-full-refund\norder_stable_1')
      .digest('hex');
    const existing = PaymentTransaction.restore({
      ...reversal('UNKNOWN').toSnapshot(),
      attemptId: `refund_${digest.slice(0, 48)}`,
      idempotencyKey: `refund_${digest}`,
    });
    const harness = createHarness();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
    harness.transactions.findById.mockResolvedValue(
      PaymentTransaction.restore({
        ...successfulSale().toSnapshot(),
        completedAt: new Date(Date.now() - 3_600_000),
      }),
    );
    harness.transactions.findByAttemptId.mockResolvedValue(existing);
    harness.refunds.startOrRecover.mockResolvedValue(existing);
    await harness.service.refundFullOrder(
      '4750_Yonge_Street',
      'order_stable_1',
      {
        reason: 'Recover original',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
      },
    );
    expect(harness.refunds.startOrRecover).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'VOID',
        attemptId: existing.attemptId,
        idempotencyKey: existing.idempotencyKey,
      }),
    );
    expect(harness.transactions.findByAttemptId).toHaveBeenCalledTimes(1);
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });

  it.each([
    { providerRefundId: null, reversalOutcome: 'VOIDED' },
    { providerRefundId: 'clover-refund-1', reversalOutcome: 'REFUNDED' },
  ])(
    'projects the confirmed actual outcome while retaining VOID: %p',
    async (facts) => {
      const harness = createHarness();
      const confirmed = PaymentTransaction.restore({
        ...reversal('SUCCEEDED').toSnapshot(),
        providerRefundId: facts.providerRefundId,
      });
      harness.orders.getByStableIdForStore.mockResolvedValue(order());
      harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
      harness.transactions.findById.mockResolvedValue(successfulSale());
      harness.transactions.findByAttemptId.mockResolvedValue(confirmed);
      harness.refunds.startOrRecover.mockResolvedValue(confirmed);
      harness.orders.createFullRefund.mockResolvedValue({
        order: order({ status: 'refunded' }),
        outcome: 'refunded',
      });
      await expect(
        harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
          reason: 'Confirmed reversal',
          operatorName: 'Staff',
          refundMethod: PaymentMethod.CARD,
        }),
      ).resolves.toMatchObject({
        operation: 'VOID',
        status: 'SUCCEEDED',
        reversalOutcome: facts.reversalOutcome,
      });
      expect(harness.orders.createFullRefund).toHaveBeenCalledTimes(1);
    },
  );

  it('starts a fresh idempotent reversal only after a previous managed attempt is definitively failed', async () => {
    const harness = createHarness();
    const previous = failedReversal();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
    harness.transactions.findById.mockResolvedValue(successfulSale());
    harness.transactions.findByAttemptId
      .mockResolvedValueOnce(previous)
      .mockResolvedValueOnce(null);
    harness.refunds.startOrRecover.mockResolvedValue(reversal('SUCCEEDED'));
    harness.orders.createFullRefund.mockResolvedValue({
      order: order({ status: 'refunded' }),
      outcome: 'refunded',
    });

    await harness.service.refundFullOrder(
      '4750_Yonge_Street',
      'order_stable_1',
      {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
      },
    );

    expect(harness.transactions.findByAttemptId).toHaveBeenCalledTimes(2);
    const retryInput = harness.refunds.startOrRecover.mock.calls[0]?.[0] as
      | { attemptId: string; idempotencyKey: string }
      | undefined;
    expect(retryInput).toBeDefined();
    expect(retryInput?.attemptId).not.toBe(previous.attemptId);
    expect(retryInput?.idempotencyKey).not.toBe(previous.idempotencyKey);
  });

  it('finalizes Order refund side effects only once across duplicate managed success requests', async () => {
    const harness = createHarness();
    const currentOrder = order();
    const refundedOrder = order({ status: 'refunded' });
    harness.orders.getByStableIdForStore
      .mockResolvedValueOnce(currentOrder)
      .mockResolvedValueOnce(refundedOrder);
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
    harness.transactions.findById.mockResolvedValue(successfulSale());
    harness.transactions.findByAttemptId.mockResolvedValue(null);
    harness.refunds.startOrRecover.mockResolvedValue(reversal('SUCCEEDED'));
    harness.orders.createFullRefund.mockResolvedValue({
      order: refundedOrder,
      outcome: 'refunded',
    });

    const input = {
      reason: 'Customer cancellation',
      operatorName: 'Staff',
      refundMethod: PaymentMethod.CARD,
    };
    await harness.service.refundFullOrder(
      '4750_Yonge_Street',
      'order_stable_1',
      input,
    );
    await harness.service.refundFullOrder(
      '4750_Yonge_Street',
      'order_stable_1',
      input,
    );

    expect(harness.orders.createFullRefund).toHaveBeenCalledTimes(1);
  });

  it('does not mutate Order or loyalty while Clover refund truth is UNKNOWN', async () => {
    const harness = createHarness();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());
    harness.transactions.findById.mockResolvedValue(successfulSale());
    harness.transactions.findByAttemptId.mockResolvedValue(null);
    harness.refunds.startOrRecover.mockResolvedValue(reversal('UNKNOWN'));

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
      }),
    ).resolves.toMatchObject({
      mode: 'MANAGED',
      status: 'UNKNOWN',
      order: { status: 'paid' },
    });
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });

  it('never falls back to legacy when a unified checkout exists but finalization is incomplete', async () => {
    const harness = createHarness();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue({
      ...checkout(),
      status: 'FINALIZING',
    });

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
      }),
    ).resolves.toMatchObject({
      mode: 'MANAGED',
      status: 'UNKNOWN',
      operation: null,
      failureCode: 'POS_MANAGED_CARD_CHECKOUT_NOT_COMPLETED',
      order: { status: 'paid' },
    });
    expect(harness.refunds.startOrRecover).not.toHaveBeenCalled();
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });

  it('returns an explicit legacy decision only when the order has no unified checkout', async () => {
    const harness = createHarness();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue(null);

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CARD,
      }),
    ).resolves.toMatchObject({
      mode: 'LEGACY_MANUAL_REQUIRED',
      status: null,
    });
    expect(harness.refunds.startOrRecover).not.toHaveBeenCalled();
  });

  it('does not allow a unified Clover card order to fall back to another refund method', async () => {
    const harness = createHarness();
    harness.orders.getByStableIdForStore.mockResolvedValue(order());
    harness.checkouts.findByOrderStableId.mockResolvedValue(checkout());

    await expect(
      harness.service.refundFullOrder('4750_Yonge_Street', 'order_stable_1', {
        reason: 'Customer cancellation',
        operatorName: 'Staff',
        refundMethod: PaymentMethod.CASH,
      }),
    ).resolves.toMatchObject({
      mode: 'MANAGED',
      status: 'FAILED',
      failureCode: 'POS_MANAGED_CARD_REFUND_REQUIRES_CARD',
    });
    expect(harness.refunds.startOrRecover).not.toHaveBeenCalled();
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });
});
