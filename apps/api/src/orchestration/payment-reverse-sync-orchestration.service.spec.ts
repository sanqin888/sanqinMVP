import { PaymentMethod } from '@prisma/client';

import type { OrderDto } from '../orders/dto/order.dto';
import type { OrdersService } from '../orders/orders.service';
import type { PaymentReverseSyncResult } from '../payments/application/payment-reverse-sync.service';
import { PaymentTransaction } from '../payments/domain/payment-transaction';
import type { PosGateway } from '../pos/pos.gateway';
import type {
  PaymentCheckoutAttemptService,
  PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';
import {
  PaymentReverseSyncOrchestrationService,
  PaymentReverseSyncRetryableError,
} from './payment-reverse-sync-orchestration.service';
import type { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const order = (overrides: Partial<OrderDto> = {}): OrderDto => ({
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
  subtotalCents: 1_800,
  taxCents: 200,
  deliveryFeeCents: 0,
  deliveryCostCents: null,
  deliverySubsidyCents: null,
  totalCents: 2_000,
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

const checkout = (
  overrides: Partial<PreparedPaymentCheckout> = {},
): PreparedPaymentCheckout =>
  ({
    id: '33333333-3333-4333-8333-333333333333',
    attemptId: 'sale-attempt-1',
    idempotencyKey: 'sale-idempotency-1',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    storeId: '4750_Yonge_Street',
    status: 'COMPLETED',
    externalAmountCents: 1_500,
    paymentTransactionId: '11111111-1111-4111-8111-111111111111',
    plannedOrderId: '22222222-2222-4222-8222-222222222222',
    orderId: '44444444-4444-4444-8444-444444444444',
    orderStableId: 'order_stable_1',
    expiresAt: new Date(Date.now() + 60_000),
    snapshot: {},
    ...overrides,
  }) as PreparedPaymentCheckout;

const successfulSale = (refundedAmountCents = 0): PaymentTransaction =>
  PaymentTransaction.create({
    id: '11111111-1111-4111-8111-111111111111',
    attemptId: 'sale-attempt-1',
    idempotencyKey: 'sale-idempotency-1',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    paymentMethod: 'CARD',
    operation: 'SALE',
    amountCents: 1_500,
    currency: 'CAD',
    externalPaymentId: 'external-1',
  })
    .transitionTo('PROCESSING')
    .applyProviderOutcome({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'provider-payment-1',
      surchargeCents: 36,
      chargedTotalCents: 1_536,
      refundedAmountCents,
    });

const result = (
  externalReversal: PaymentReverseSyncResult['externalReversal'],
  payment = successfulSale(
    externalReversal === 'NONE'
      ? 0
      : externalReversal === 'PARTIAL_REFUND'
        ? 500
        : 1_500,
  ),
): PaymentReverseSyncResult => ({
  processingResult: 'APPLIED',
  payment,
  externalReversal,
  previousRefundedAmountCents: 0,
  failureCode: null,
  failureMessage: null,
});

const createHarness = () => {
  const checkouts = {
    findByAttemptId: jest.fn(),
    findByOrderStableId: jest.fn(),
    markExternallyReversedAndRelease: jest.fn(),
  };
  const cardPayments = {
    applyReverseSyncedPayment: jest.fn(),
  };
  const orders = {
    getByStableId: jest.fn(),
    createFullRefund: jest.fn(),
  };
  const posGateway = {
    publishCardPaymentStatus: jest.fn(),
    publishCardPaymentReverseSync: jest.fn(),
  };

  const service = new PaymentReverseSyncOrchestrationService(
    checkouts as unknown as PaymentCheckoutAttemptService,
    cardPayments as unknown as PosCardPaymentOrchestrationService,
    orders as unknown as OrdersService,
    posGateway as unknown as PosGateway,
  );

  return { service, checkouts, cardPayments, orders, posGateway };
};

describe('PaymentReverseSyncOrchestrationService', () => {
  it('finalizes a completed SanQ order only after Clover canonical full-refund truth exists', async () => {
    const harness = createHarness();
    const completed = checkout();
    harness.checkouts.findByAttemptId.mockResolvedValue(completed);
    harness.checkouts.findByOrderStableId.mockResolvedValue(completed);
    harness.orders.getByStableId.mockResolvedValue(order());
    harness.orders.createFullRefund.mockResolvedValue({
      order: order({ status: 'refunded' }),
      outcome: 'refunded',
    });

    await expect(
      harness.service.apply(result('FULL_REFUND')),
    ).resolves.toEqual({
      action: 'ORDER_REFUNDED',
      orderStableId: 'order_stable_1',
    });
    expect(harness.orders.createFullRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        orderStableId: 'order_stable_1',
        refundAmountCents: 2_000,
        originalPaymentMethod: PaymentMethod.CARD,
        refundMethod: PaymentMethod.CARD,
      }),
    );
    expect(
      harness.posGateway.publishCardPaymentReverseSync,
    ).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      expect.objectContaining({
        externalReversal: 'FULL_REFUND',
        refundedAmountCents: 1_500,
        orderStatus: 'refunded',
      }),
    );
  });

  it('does not apply Order refund side effects twice when the order is already refunded', async () => {
    const harness = createHarness();
    const completed = checkout();
    harness.checkouts.findByAttemptId.mockResolvedValue(completed);
    harness.checkouts.findByOrderStableId.mockResolvedValue(completed);
    harness.orders.getByStableId.mockResolvedValue(
      order({ status: 'refunded' }),
    );

    await expect(harness.service.apply(result('VOID'))).resolves.toEqual({
      action: 'ORDER_ALREADY_REFUNDED',
      orderStableId: 'order_stable_1',
    });
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });

  it('records and broadcasts a partial external refund without falsely refunding the whole order', async () => {
    const harness = createHarness();
    harness.checkouts.findByAttemptId.mockResolvedValue(checkout());
    harness.orders.getByStableId.mockResolvedValue(order());

    await expect(
      harness.service.apply(result('PARTIAL_REFUND')),
    ).resolves.toEqual({
      action: 'PARTIAL_REFUND_REVIEW_REQUIRED',
      orderStableId: 'order_stable_1',
    });
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
    expect(
      harness.posGateway.publishCardPaymentReverseSync,
    ).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      expect.objectContaining({
        externalReversal: 'PARTIAL_REFUND',
        refundedAmountCents: 500,
        requiresManualReview: true,
      }),
    );
  });

  it('cancels an unfinished checkout and releases its holds instead of creating an order after full external reversal', async () => {
    const harness = createHarness();
    harness.checkouts.findByAttemptId.mockResolvedValue(
      checkout({ status: 'SUCCEEDED', orderId: null }),
    );
    harness.checkouts.markExternallyReversedAndRelease.mockResolvedValue(
      checkout({ status: 'CANCELLED', orderId: null }),
    );

    await expect(
      harness.service.apply(result('FULL_REFUND')),
    ).resolves.toEqual({
      action: 'CHECKOUT_CANCELLED',
      orderStableId: 'order_stable_1',
    });
    expect(
      harness.checkouts.markExternallyReversedAndRelease,
    ).toHaveBeenCalledWith('sale-attempt-1');
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
    expect(harness.posGateway.publishCardPaymentStatus).toHaveBeenCalledWith(
      '4750_Yonge_Street',
      expect.objectContaining({
        status: 'CANCELLED',
        failureCode: 'PAYMENT_EXTERNALLY_REVERSED',
      }),
    );
  });

  it('asks Clover to retry while checkout finalization owns the Order creation race', async () => {
    const harness = createHarness();
    harness.checkouts.findByAttemptId.mockResolvedValue(
      checkout({ status: 'FINALIZING' }),
    );

    await expect(
      harness.service.apply(result('FULL_REFUND')),
    ).rejects.toBeInstanceOf(PaymentReverseSyncRetryableError);
    expect(harness.orders.createFullRefund).not.toHaveBeenCalled();
  });

  it('reuses the existing POS payment finalization/realtime path when no reversal exists', async () => {
    const harness = createHarness();
    harness.cardPayments.applyReverseSyncedPayment.mockResolvedValue({
      attemptId: 'sale-attempt-1',
      paymentId: '11111111-1111-4111-8111-111111111111',
      status: 'SUCCEEDED',
      failureCode: null,
      failureMessage: null,
      externalAmountCents: 1_500,
      surchargeCents: 36,
      chargedTotalCents: 1_536,
      pointsCents: 0,
      balanceCents: 0,
      couponDiscountCents: 0,
      orderStableId: 'order_stable_1',
      orderNumber: '1001',
      pickupCode: null,
    });

    await expect(harness.service.apply(result('NONE'))).resolves.toEqual({
      action: 'CHECKOUT_UPDATED',
      orderStableId: 'order_stable_1',
    });
  });
});
