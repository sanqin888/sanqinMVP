import type { LoyaltyOrderUsageReaderPort } from '../loyalty/public-api';
import type { PrismaService } from './orders-prisma';
import { OrderPublicSummaryQueryUseCase } from './order-public-summary-query.use-case';

describe('OrderPublicSummaryQueryUseCase', () => {
  it('preserves surcharge, loyalty usage, totals, and line-item projection', async () => {
    const orderFindUnique = jest.fn().mockResolvedValue({
      orderStableId: 'csummaryorder000000000001',
      clientRequestId: 'SQ2609060001',
      status: 'paid',
      createdAt: new Date('2026-09-06T20:00:00.000Z'),
      fulfillmentType: 'pickup',
      subtotalCents: 1200,
      subtotalAfterDiscountCents: 1100,
      taxCents: 143,
      deliveryFeeCents: 0,
      totalCents: 1243,
      paymentTotalCents: null,
      creditCardSurchargeCents: 0,
      couponDiscountCents: 100,
      couponTitleSnapshot: 'Member coupon',
      loyaltyRedeemCents: 0,
      promotionSnapshot: null,
      items: [
        {
          productStableId: 'cproduct00000000000000001',
          displayName: 'Roujiamo',
          nameEn: 'Roujiamo',
          nameZh: '肉夹馍',
          qty: 2,
          unitPriceCents: 600,
          optionsJson: null,
          componentsJson: null,
        },
      ],
    });
    const checkoutIntentFindFirst = jest.fn().mockResolvedValue({
      metadataJson: {
        creditCardSurchargeCents: 30,
        creditCardSurchargeRate: 2.4,
      },
    });
    const getOrderUsage = jest.fn().mockResolvedValue({
      balancePaidCents: 243,
      pointsEarned: 11,
    });
    const prisma = {
      order: { findUnique: orderFindUnique },
      checkoutIntent: { findFirst: checkoutIntentFindFirst },
    } as unknown as PrismaService;
    const loyalty = { getOrderUsage } as unknown as LoyaltyOrderUsageReaderPort;
    const useCase = new OrderPublicSummaryQueryUseCase(prisma, loyalty);

    const result = await useCase.getByStableId('csummaryorder000000000001');

    expect(result.itemCount).toBe(2);
    expect(result.discountCents).toBe(100);
    expect(result.creditCardSurchargeCents).toBe(30);
    expect(result.creditCardSurchargeRate).toBe(2.4);
    expect(result.paymentTotalCents).toBe(1273);
    expect(result.externalPaidCents).toBe(1000);
    expect(result.pointsEarned).toBe(11);
    expect(result.lineItems[0]?.totalPriceCents).toBe(1200);
    expect(orderFindUnique).toHaveBeenCalledTimes(1);
    expect(checkoutIntentFindFirst).toHaveBeenCalledTimes(1);
    expect(getOrderUsage).toHaveBeenCalledTimes(1);
  });

  it('preserves the stable-id-only rejection before persistence access', async () => {
    const orderFindUnique = jest.fn();
    const prisma = {
      order: { findUnique: orderFindUnique },
    } as unknown as PrismaService;
    const loyalty = {
      getOrderUsage: jest.fn(),
    } as unknown as LoyaltyOrderUsageReaderPort;
    const useCase = new OrderPublicSummaryQueryUseCase(prisma, loyalty);

    await expect(useCase.getByStableId('not-a-stable-id')).rejects.toThrow(
      'stableId only',
    );
    expect(orderFindUnique).not.toHaveBeenCalled();
  });
});
