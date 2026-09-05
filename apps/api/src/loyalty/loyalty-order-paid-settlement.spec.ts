import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from './loyalty.service';

describe('Loyalty order-paid settlement boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('translates orderStableId to internal persistence ids inside Loyalty', async () => {
    const orderFindUnique = jest.fn().mockResolvedValue({
      id: '8a3d4c0e-4750-4f6a-9138-000000000101',
      userId: '8a3d4c0e-4750-4f6a-9138-000000000202',
    });
    const service = new LoyaltyService(
      {
        order: { findUnique: orderFindUnique },
      } as unknown as PrismaService,
      {} as never,
    );
    const settleOnPaid = jest
      .spyOn(service, 'settleOnPaid')
      .mockResolvedValue(undefined);

    await service.settleOrderPaid({
      orderStableId: 'CORD-PAID-BOUNDARY-001',
      subtotalCents: 2_500,
      redeemValueCents: 500,
      earnMultiplier: 2,
    });

    expect(orderFindUnique).toHaveBeenCalledWith({
      where: { orderStableId: 'CORD-PAID-BOUNDARY-001' },
      select: { id: true, userId: true },
    });
    expect(settleOnPaid).toHaveBeenCalledWith({
      orderId: '8a3d4c0e-4750-4f6a-9138-000000000101',
      userId: '8a3d4c0e-4750-4f6a-9138-000000000202',
      subtotalCents: 2_500,
      redeemValueCents: 500,
      earnMultiplier: 2,
    });
  });

  it('keeps settlement failure isolated from the paid-order lifecycle caller', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new LoyaltyService(
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: '8a3d4c0e-4750-4f6a-9138-000000000303',
            userId: '8a3d4c0e-4750-4f6a-9138-000000000404',
          }),
        },
      } as unknown as PrismaService,
      {} as never,
    );
    jest
      .spyOn(service, 'settleOnPaid')
      .mockRejectedValue(new Error('ledger failed'));

    await expect(
      service.settleOrderPaid({
        orderStableId: 'CORD-PAID-BOUNDARY-002',
        subtotalCents: 1_000,
        redeemValueCents: 0,
        earnMultiplier: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('keeps stable-id lookup failure isolated from the paid-order lifecycle caller', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new LoyaltyService(
      {
        order: {
          findUnique: jest.fn().mockRejectedValue(new Error('lookup failed')),
        },
      } as unknown as PrismaService,
      {} as never,
    );

    await expect(
      service.settleOrderPaid({
        orderStableId: 'CORD-PAID-BOUNDARY-003',
        subtotalCents: 1_000,
        redeemValueCents: 0,
        earnMultiplier: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
