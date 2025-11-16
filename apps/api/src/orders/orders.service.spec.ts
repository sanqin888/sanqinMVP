import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UberDirectService } from '../deliveries/uber-direct.service';
import { DeliveryType } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };
  let loyalty: {
    peekBalanceMicro: jest.Mock;
    maxRedeemableCentsFromBalance: jest.Mock;
    settleOnPaid: jest.Mock;
    rollbackOnRefund: jest.Mock;
  };
  let uberDirect: { createDelivery: jest.Mock };

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    loyalty = {
      peekBalanceMicro: jest.fn().mockResolvedValue(0n),
      maxRedeemableCentsFromBalance: jest.fn().mockReturnValue(0),
      settleOnPaid: jest.fn(),
      rollbackOnRefund: jest.fn(),
    };

    uberDirect = {
      createDelivery: jest.fn(),
    };

    service = new OrdersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
      uberDirect as unknown as UberDirectService,
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
    await expect(service.advance('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires deliveryDestination for priority orders', async () => {
    const dto: Partial<CreateOrderDto> = {
      channel: 'web',
      fulfillmentType: 'pickup',
      subtotalCents: 1000,
      deliveryType: DeliveryType.PRIORITY,
    };

    await expect(
      service.create(dto as CreateOrderDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('dispatches Uber Direct for priority orders', async () => {
    const storedOrder = {
      id: 'order-1',
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '1234',
      clientRequestId: 'req-1',
      items: [
        { id: 'item-1', productId: 'demo', qty: 1, unitPriceCents: 1000 },
      ],
    };
    prisma.order.create.mockResolvedValue(storedOrder);
    uberDirect.createDelivery.mockResolvedValue({ deliveryId: 'uber-123' });
    prisma.order.update.mockResolvedValue({
      ...storedOrder,
      externalDeliveryId: 'uber-123',
    });

    const dto: CreateOrderDto = {
      channel: 'web',
      fulfillmentType: 'pickup',
      items: [{ productId: 'demo', qty: 1 }],
      subtotalCents: 1000,
      taxCents: 0,
      totalCents: 1000,
      deliveryType: DeliveryType.PRIORITY,
      deliveryDestination: {
        name: 'Test User',
        phone: '+1-555-111-2222',
        addressLine1: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M3J 0L9',
      },
    };

    const order = await service.create(dto, undefined);

    expect(uberDirect.createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        destination: expect.objectContaining({ postalCode: 'M3J 0L9' }),
      }),
    );
    expect(order.externalDeliveryId).toBe('uber-123');
  });

  it('cleans up persisted order when Uber Direct fails', async () => {
    const storedOrder = {
      id: 'order-err',
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '9999',
      clientRequestId: null,
      items: [],
    };
    prisma.order.create.mockResolvedValue(storedOrder);
    uberDirect.createDelivery.mockRejectedValue(new Error('boom'));

    const dto: CreateOrderDto = {
      channel: 'web',
      fulfillmentType: 'pickup',
      items: [],
      subtotalCents: 1000,
      taxCents: 0,
      totalCents: 1000,
      deliveryType: DeliveryType.PRIORITY,
      deliveryDestination: {
        name: 'Test User',
        phone: '+1-555-111-2222',
        addressLine1: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M3J 0L9',
      },
    };

    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: 'order-err' } });
  });
});
