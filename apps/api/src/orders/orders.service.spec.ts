import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let loyalty: {
    earnOnOrderPaid: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    loyalty = {
      earnOnOrderPaid: jest.fn(),
    };

    service = new OrdersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
    );
  });

  it('propagates NotFoundException when the order is missing during update', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus('missing', 'paid'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates BadRequestException for illegal status transitions', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: 'paid',
      items: [],
    });

    await expect(
      service.updateStatus('order-1', 'pending'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException when advancing a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.advance('missing-order')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
