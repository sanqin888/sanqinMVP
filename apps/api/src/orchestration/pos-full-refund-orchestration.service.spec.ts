import { PaymentMethod } from '@prisma/client';

import type { PosOrdersService } from '../pos/pos-orders.service';
import type { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';
import { PosFullRefundOrchestrationService } from './pos-full-refund-orchestration.service';

const input = {
  reason: 'Customer cancellation',
  operatorName: 'Staff',
  refundAmountCents: 2000,
  originalPaymentMethod: PaymentMethod.CARD,
  refundMethod: PaymentMethod.CARD,
};

const order = {
  orderStableId: 'order_stable_1',
  status: 'paid',
};

const createHarness = () => {
  const cardRefunds = { refundFullOrder: jest.fn() };
  const posOrders = { createFullRefund: jest.fn() };
  const service = new PosFullRefundOrchestrationService(
    cardRefunds as unknown as PosCardRefundOrchestrationService,
    posOrders as unknown as PosOrdersService,
  );
  return { cardRefunds, posOrders, service };
};

describe('PosFullRefundOrchestrationService', () => {
  it('preserves the legacy manual refund path only after an explicit legacy classification', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'LEGACY_MANUAL_REQUIRED',
      status: null,
      operation: null,
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: null,
      failureMessage: null,
    });
    harness.posOrders.createFullRefund.mockResolvedValue({
      order: { ...order, status: 'refunded' },
      outcome: 'refunded',
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({ outcome: 'refunded' });
    expect(harness.posOrders.createFullRefund).toHaveBeenCalledWith(
      'order_stable_1',
      input,
    );
  });

  it('never falls back to the legacy Order-first path for an uncertain managed refund', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'UNKNOWN',
      operation: 'REFUND',
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: 'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
      failureMessage: 'not visible yet',
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({
      outcome: 'pending_platform',
      managedPaymentStatus: 'UNKNOWN',
      managedPaymentOperation: 'REFUND',
      order: { status: 'paid' },
    });
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });

  it('returns the historical response shape after canonical managed success', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation: 'VOID',
      order: { ...order, status: 'refunded' },
      refundedCardBaseCents: 1500,
      refundedAdditionalChargeCents: 36,
      refundedCustomerTotalCents: 1536,
      failureCode: null,
      failureMessage: null,
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({
      outcome: 'refunded',
      managedPaymentStatus: 'SUCCEEDED',
      managedPaymentOperation: 'VOID',
    });
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });

  it('does not hide a definitive managed refund failure behind legacy fallback', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'FAILED',
      operation: 'REFUND',
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: 'CLOVER_REFUND_FAILED',
      failureMessage: 'refund failed',
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CLOVER_REFUND_FAILED',
      }),
    });
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });
});
