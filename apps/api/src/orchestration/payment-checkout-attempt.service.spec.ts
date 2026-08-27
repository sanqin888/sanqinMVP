/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method */
import type { PaymentCheckoutAttempt } from '@prisma/client';
import type { CreateOrderInput } from '@shared/order';

import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { MembershipService } from '../membership/membership.service';
import type {
  OrdersService,
  PreparedPaymentOrderSnapshot,
} from '../orders/orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';

const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
const storeStableId = '4750_Yonge_Street';

const order: CreateOrderInput = {
  channel: 'in_store',
  fulfillmentType: 'pickup',
  paymentMethod: 'CARD',
  userStableId: 'cmember1',
  pointsToRedeem: 2,
  balanceUsedCents: 300,
  couponStableId: 'ccoupon1',
  selectedUserCouponId: 'user-coupon-1',
  items: [{ productStableId: 'citem1', qty: 1, unitPrice: 10 }],
};

const snapshot: PreparedPaymentOrderSnapshot = {
  version: 1,
  order,
  userId: '22222222-2222-4222-8222-222222222222',
  storeId: storeStableId,
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
};

const createHarness = () => {
  let row: PaymentCheckoutAttempt | null = null;
  let idSequence = 0;

  const paymentCheckoutAttempt = {
    findUnique: jest.fn().mockImplementation(async ({ where }) => {
      if (!row) return null;
      if ('attemptId' in where && where.attemptId === row.attemptId) return row;
      return null;
    }),
    findFirst: jest.fn().mockImplementation(async () => row),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async ({ data }) => {
      idSequence += 1;
      row = {
        id: `44444444-4444-4444-8444-44444444444${idSequence}`,
        attemptId: data.attemptId,
        idempotencyKey: data.idempotencyKey,
        source: data.source,
        storeId: data.storeId,
        paymentMethod: data.paymentMethod,
        currency: data.currency,
        orderDraftJson: data.orderDraftJson,
        pricingSnapshotJson: data.pricingSnapshotJson,
        tenderAllocationJson: data.tenderAllocationJson,
        externalAmountCents: data.externalAmountCents,
        status: 'PREPARING',
        paymentTransactionId: null,
        plannedOrderId: data.plannedOrderId,
        orderId: null,
        orderStableId: data.orderStableId,
        expiresAt: data.expiresAt,
        finalizedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as PaymentCheckoutAttempt;
      return row;
    }),
    updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
      if (!row) return { count: 0 };
      const statusMatches =
        where.status === undefined ||
        (typeof where.status === 'string' && row.status === where.status) ||
        (where.status?.in && where.status.in.includes(row.status));
      const idMatches = where.id === undefined || where.id === row.id;
      const attemptMatches =
        where.attemptId === undefined || where.attemptId === row.attemptId;
      if (!statusMatches || !idMatches || !attemptMatches) return { count: 0 };
      row = {
        ...row,
        ...data,
        updatedAt: new Date(),
      } as PaymentCheckoutAttempt;
      return { count: 1 };
    }),
    update: jest.fn().mockImplementation(async ({ data }) => {
      if (!row) throw new Error('missing checkout row');
      row = {
        ...row,
        ...data,
        updatedAt: new Date(),
      } as PaymentCheckoutAttempt;
      return row;
    }),
  };

  const prisma = {
    paymentCheckoutAttempt,
  } as unknown as PrismaService;
  const orders = {
    preparePaymentOrder: jest.fn().mockResolvedValue(snapshot),
  } as unknown as jest.Mocked<OrdersService>;
  const loyalty = {
    holdPaymentTender: jest.fn().mockResolvedValue({
      reservationId: 'loyalty-reservation-1',
      userId: snapshot.userId,
      pointsValueCents: 200,
      balanceCents: 300,
    }),
    releasePaymentTender: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LoyaltyService>;
  const membership = {
    holdPaymentCoupons: jest.fn().mockResolvedValue({
      couponId: null,
      selectedUserCouponId: null,
    }),
    releasePaymentCoupons: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MembershipService>;

  const service = new PaymentCheckoutAttemptService(
    prisma,
    orders,
    loyalty,
    membership,
  );

  return {
    service,
    paymentCheckoutAttempt,
    orders,
    loyalty,
    membership,
    getRow: () => row,
  };
};

describe('PaymentCheckoutAttemptService', () => {
  it('persists PREPARING before HOLD and becomes PREPARED only after all holds succeed', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.loyalty.holdPaymentTender)
      .mockImplementation(async () => {
        expect(harness.getRow()?.status).toBe('PREPARING');
        return {
          reservationId: 'loyalty-reservation-1',
          userId: snapshot.userId,
          pointsValueCents: 200,
          balanceCents: 300,
        };
      });
    jest
      .mocked(harness.membership.holdPaymentCoupons)
      .mockImplementation(async () => {
        expect(harness.getRow()?.status).toBe('PREPARING');
        return { couponId: null, selectedUserCouponId: null };
      });

    const prepared = await harness.service.prepare({
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    });

    expect(prepared.status).toBe('PREPARED');
    expect(prepared.externalAmountCents).toBe(700);
    expect(prepared.storeId).toBe(storeStableId);
    expect(prepared.snapshot.storeId).toBe(storeStableId);
    expect(harness.orders.preparePaymentOrder).toHaveBeenCalledWith(
      order,
      storeStableId,
    );
    expect(harness.paymentCheckoutAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storeId: storeStableId }),
      }),
    );
    expect(harness.paymentCheckoutAttempt.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storeId: storeDbId }),
      }),
    );
    expect(harness.loyalty.holdPaymentTender).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        pointsValueCents: 200,
        balanceCents: 300,
      }),
    );
    expect(harness.membership.holdPaymentCoupons).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        couponStableId: 'ccoupon1',
        selectedUserCouponId: 'user-coupon-1',
      }),
    );
  });

  it('releases every partial hold and marks FAILED if reservation preparation fails', async () => {
    const harness = createHarness();
    jest
      .mocked(harness.membership.holdPaymentCoupons)
      .mockRejectedValue(new Error('coupon race'));

    await expect(
      harness.service.prepare({
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        storeId: storeStableId,
        attemptId: 'attempt-1',
        clientIdempotencyKey: 'client-idem-1',
        order,
      }),
    ).rejects.toThrow('coupon race');

    expect(harness.loyalty.releasePaymentTender).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.membership.releasePaymentCoupons).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.getRow()?.status).toBe('FAILED');
  });

  it('releases payment holds exactly once when an external reversal cancels an in-flight checkout', async () => {
    const harness = createHarness();
    await harness.service.prepare({
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    });
    await harness.service.claimProviderStart('attempt-1');

    const first = await harness.service.markExternallyReversedAndRelease(
      'attempt-1',
    );
    const second = await harness.service.markExternallyReversedAndRelease(
      'attempt-1',
    );

    expect(first.status).toBe('CANCELLED');
    expect(second.status).toBe('CANCELLED');
    expect(harness.loyalty.releasePaymentTender).toHaveBeenCalledTimes(1);
    expect(harness.membership.releasePaymentCoupons).toHaveBeenCalledTimes(1);
  });

  it('reuses the persisted immutable snapshot without requoting on duplicate start', async () => {
    const harness = createHarness();
    const input = {
      source: 'POS_TERMINAL' as const,
      paymentMethod: 'CARD' as const,
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    };

    const first = await harness.service.prepare(input);
    const second = await harness.service.prepare(input);

    expect(first.id).toBe(second.id);
    expect(harness.orders.preparePaymentOrder).toHaveBeenCalledTimes(1);
    expect(harness.loyalty.holdPaymentTender).toHaveBeenCalledTimes(1);
    expect(harness.membership.holdPaymentCoupons).toHaveBeenCalledTimes(1);
  });

  it('rejects the same attempt when the store or order draft changes', async () => {
    const harness = createHarness();
    await harness.service.prepare({
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    });

    await expect(
      harness.service.requireForInput({
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        storeId: storeDbId,
        attemptId: 'attempt-1',
        clientIdempotencyKey: 'client-idem-1',
        order,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_CHECKOUT_IDENTITY_MISMATCH' },
    });
  });

  it('expires PREPARED with CAS and releases holds before provider processing', async () => {
    const harness = createHarness();
    const input = {
      source: 'POS_TERMINAL' as const,
      paymentMethod: 'CARD' as const,
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    };
    await harness.service.prepare(input);
    const row = harness.getRow();
    if (!row) throw new Error('checkout row missing');
    row.expiresAt = new Date('2020-01-01T00:00:00.000Z');

    await expect(harness.service.prepare(input)).rejects.toMatchObject({
      response: { code: 'PAYMENT_PREPARATION_EXPIRED' },
    });
    expect(harness.loyalty.releasePaymentTender).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.membership.releasePaymentCoupons).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.getRow()?.status).toBe('FAILED');
  });

  it('cancels PREPARED with CAS before releasing reservations', async () => {
    const harness = createHarness();
    await harness.service.prepare({
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    });

    const cancelled = await harness.service.cancelBeforeProvider('attempt-1');

    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.checkout.status).toBe('CANCELLED');
    expect(harness.loyalty.releasePaymentTender).toHaveBeenCalledWith(
      'attempt-1',
    );
    expect(harness.membership.releasePaymentCoupons).toHaveBeenCalledWith(
      'attempt-1',
    );
  });

  it('does not release reservations when a stale failure races after provider processing started', async () => {
    const harness = createHarness();
    await harness.service.prepare({
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: 'attempt-1',
      clientIdempotencyKey: 'client-idem-1',
      order,
    });
    const row = harness.getRow();
    if (!row) throw new Error('checkout row missing');
    row.status = 'PROCESSING';
    jest.clearAllMocks();

    const current = await harness.service.markDefinitiveFailureAndRelease(
      'attempt-1',
      'FAILED',
    );

    expect(current.status).toBe('PROCESSING');
    expect(harness.loyalty.releasePaymentTender).not.toHaveBeenCalled();
    expect(harness.membership.releasePaymentCoupons).not.toHaveBeenCalled();
  });
});
