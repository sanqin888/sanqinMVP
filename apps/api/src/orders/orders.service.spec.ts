import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UberDirectService } from '../deliveries/uber-direct.service';
import { MembershipService } from '../membership/membership.service';
import { DoorDashDriveService } from '../deliveries/doordash-drive.service';
import { DeliveryType } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    $transaction: jest.Mock;
    businessConfig: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    order: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    menuItem: {
      findMany: jest.Mock;
    };
    menuOptionTemplateChoice: {
      findMany: jest.Mock;
    };
  };
  let loyalty: {
    peekBalanceMicro: jest.Mock;
    maxRedeemableCentsFromBalance: jest.Mock;
    reserveRedeemForOrder: jest.Mock;
    resolveUserIdByStableId: jest.Mock;
    settleOnPaid: jest.Mock;
    rollbackOnRefund: jest.Mock;
  };
  let membership: {
    validateCouponForOrder: jest.Mock;
    reserveCouponForOrder: jest.Mock;
    releaseCouponForOrder: jest.Mock;
    markCouponUsedForOrder: jest.Mock;
  };
  let uberDirect: { createDelivery: jest.Mock };
  let doorDashDrive: { createDelivery: jest.Mock };

  beforeEach(() => {
    process.env.UBER_DIRECT_ENABLED = '1';
    const demoProductId = 'c1234567890abcdefghijklmn';

    type MenuItemFindManyArgs = {
      where?: {
        OR?: Array<{
          id?: { in?: string[] };
          stableId?: { in?: string[] };
        }>;
        id?: { in?: string[] };
      };
    };

    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          Promise.resolve(callback(prisma)),
        ),
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          deliveryBaseFeeCents: 600,
          priorityPerKmCents: 100,
          salesTaxRate: 0.13,
        }),
        create: jest.fn().mockResolvedValue({
          id: 1,
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          deliveryBaseFeeCents: 600,
          priorityPerKmCents: 100,
          salesTaxRate: 0.13,
        }),
      },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      menuItem: {
        findMany: jest.fn().mockImplementation((args: MenuItemFindManyArgs) => {
          const idsFromOr =
            args?.where?.OR?.flatMap((cond) => [
              ...(cond.id?.in ?? []),
              ...(cond.stableId?.in ?? []),
            ]) ?? [];
          const directIds = args?.where?.id?.in ?? [];
          const ids = [...idsFromOr, ...directIds];
          if (ids.length === 0) return Promise.resolve([]);
          return Promise.resolve([
            {
              id: demoProductId,
              stableId: demoProductId,
              basePriceCents: 1000,
              nameEn: 'Demo Product',
              nameZh: null,
              isAvailable: true,
              isVisible: true,
              tempUnavailableUntil: null,
              optionGroups: [],
            },
          ]);
        }),
      },
      menuOptionTemplateChoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    loyalty = {
      peekBalanceMicro: jest.fn().mockResolvedValue(0n),
      maxRedeemableCentsFromBalance: jest.fn().mockReturnValue(0),
      reserveRedeemForOrder: jest.fn().mockResolvedValue(0),
      resolveUserIdByStableId: jest.fn(),
      settleOnPaid: jest.fn(),
      rollbackOnRefund: jest.fn(),
    };

    membership = {
      validateCouponForOrder: jest.fn().mockResolvedValue(null),
      reserveCouponForOrder: jest.fn(),
      releaseCouponForOrder: jest.fn(),
      markCouponUsedForOrder: jest.fn(),
    };

    uberDirect = {
      createDelivery: jest.fn(),
    };

    doorDashDrive = {
      createDelivery: jest.fn(),
    };

    service = new OrdersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
      membership as unknown as MembershipService,
      uberDirect as unknown as UberDirectService,
      doorDashDrive as unknown as DoorDashDriveService,
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

  it('creates order even when deliveryDestination is missing for priority orders', () => {
    const dto: Partial<CreateOrderDto> = {
      channel: 'web',
      fulfillmentType: 'pickup',
      subtotalCents: 1000,
      deliveryType: DeliveryType.PRIORITY,
    };

    const storedOrder = {
      id: 'order-no-dest',
      orderStableId: 'cord-no-dest',
      status: 'paid',
      channel: 'web',
      fulfillmentType: 'pickup',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      paidAt: new Date('2024-01-01T00:00:00.000Z'),
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '1234',
      clientRequestId: null,
      items: [],
    };
    prisma.order.create.mockResolvedValue(storedOrder);

    return service.create(dto as CreateOrderDto).then((order) => {
      // ✅ 仍然建单
      expect(prisma.order.create).toHaveBeenCalled();
      expect(order.orderStableId).toBe('cord-no-dest');

      // ✅ 因为没有 deliveryDestination，不会调 Uber Direct
      expect(uberDirect.createDelivery).not.toHaveBeenCalled();
    });
  });

  it('dispatches Uber Direct for priority orders', () => {
    const storedOrder = {
      id: 'order-1',
      orderStableId: 'cord-1',
      status: 'paid',
      channel: 'web',
      fulfillmentType: 'pickup',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      paidAt: new Date('2024-01-01T00:00:00.000Z'),
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '1234',
      clientRequestId: 'req-1',
      items: [
        {
          id: 'item-1',
          productId: 'c1234567890abcdefghijklmn',
          productStableId: 'c1234567890abcdefghijklmn',
          displayName: 'Demo Product',
          qty: 1,
          unitPriceCents: 1000,
        },
      ],
    };
    prisma.order.create.mockResolvedValue(storedOrder);
    uberDirect.createDelivery.mockResolvedValue({
      deliveryId: 'uber-123',
      externalDeliveryId: 'req-1',
    });
    prisma.order.update.mockResolvedValue({
      ...storedOrder,
      externalDeliveryId: 'uber-123',
    });

    const dto: CreateOrderDto = {
      channel: 'web',
      fulfillmentType: 'pickup',
      items: [{ productStableId: 'c1234567890abcdefghijklmn', qty: 1 }],
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

    return service.create(dto).then(() => {
      // ✅ 确认调用过 Uber Direct
      expect(uberDirect.createDelivery).toHaveBeenCalled();

      // ✅ 把 createDelivery 强类型成带参数列表的 jest.Mock，再去读 mock.calls
      const mockFn = uberDirect.createDelivery as jest.Mock<
        Promise<unknown>,
        [
          {
            orderRef: string;
            destination: { postalCode: string };
          },
        ]
      >;

      const [firstCallArg] = mockFn.mock.calls;
      const deliveryPayload = firstCallArg?.[0];

      expect(deliveryPayload).toBeDefined();
      expect(deliveryPayload?.orderRef).toBe('req-1');
      expect(deliveryPayload?.destination.postalCode).toBe('M3J 0L9');
      expect(prisma.order.update).toHaveBeenCalled();
    });
  });

  it('keeps the order when Uber Direct fails', async () => {
    const storedOrder = {
      id: 'order-err',
      orderStableId: 'cord-err',
      status: 'paid',
      channel: 'web',
      fulfillmentType: 'pickup',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      paidAt: new Date('2024-01-01T00:00:00.000Z'),
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '9999',
      clientRequestId: 'SQD2401010001',
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

    const order = await service.create(dto);

    // ✅ 订单依然存在
    expect(order).toEqual(
      expect.objectContaining({
        orderStableId: 'cord-err',
        totalCents: 1130,
      }),
    );

    // ✅ 不会删除订单
    expect(prisma.order.delete).not.toHaveBeenCalled();

    // ✅ 说明我们确实尝试调用过 Uber Direct，只是失败了
    expect(uberDirect.createDelivery).toHaveBeenCalled();
  });
});
