import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UberDirectService } from '../deliveries/uber-direct.service';
import { MembershipService } from '../membership/membership.service';
import { DoorDashDriveService } from '../deliveries/doordash-drive.service';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailService } from '../email/email.service';
import { OrderEventsBus } from '../messaging/order-events.bus';
import { DeliveryType } from '@prisma/client';
import { CreateOrderInput } from '@shared/order';

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
    menuDailySpecial: {
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    checkoutIntent: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
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
  let locationService: { geocode: jest.Mock };
  let notificationService: {
    notifyOrderReady: jest.Mock;
    notifyDeliveryDispatchFailed: jest.Mock;
  };
  let emailService: { sendOrderInvoice: jest.Mock };
  let orderEventsBus: OrderEventsBus;
  let emitOrderAccepted: jest.SpiedFunction<
    OrderEventsBus['emitOrderAccepted']
  >;
  let emitOrderPaidVerified: jest.SpiedFunction<
    OrderEventsBus['emitOrderPaidVerified']
  >;
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
              visibility: 'PUBLIC',
              tempUnavailableUntil: null,
              optionGroups: [],
            },
          ]);
        }),
      },
      menuOptionTemplateChoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      menuDailySpecial: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      checkoutIntent: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    loyalty = {
      peekBalanceMicro: jest.fn().mockResolvedValue(0n),
      maxRedeemableCentsFromBalance: jest.fn().mockResolvedValue(0),
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

    locationService = {
      geocode: jest.fn().mockResolvedValue({
        latitude: 43.6532,
        longitude: -79.3832,
      }),
    };

    notificationService = {
      notifyOrderReady: jest.fn(),
      notifyDeliveryDispatchFailed: jest.fn().mockResolvedValue({ ok: true }),
    };

    emailService = {
      sendOrderInvoice: jest.fn(),
    };

    orderEventsBus = new OrderEventsBus();
    emitOrderAccepted = jest
      .spyOn(orderEventsBus, 'emitOrderAccepted')
      .mockImplementation(() => undefined);
    emitOrderPaidVerified = jest
      .spyOn(orderEventsBus, 'emitOrderPaidVerified')
      .mockImplementation(() => undefined);

    service = new OrdersService(
      prisma as unknown as PrismaService,
      loyalty as unknown as LoyaltyService,
      membership as unknown as MembershipService,
      uberDirect as unknown as UberDirectService,
      doorDashDrive as unknown as DoorDashDriveService,
      locationService as unknown as LocationService,
      notificationService as unknown as NotificationService,
      emailService as unknown as EmailService,
      orderEventsBus,
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
    const dto: CreateOrderInput = {
      channel: 'web',
      fulfillmentType: 'pickup',
      paymentMethod: 'CASH',
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

    return service.create(dto).then((order) => {
      // ✅ 仍然建单
      expect(prisma.order.create).toHaveBeenCalled();
      expect(order.orderStableId).toBe('cord-no-dest');

      // ✅ 因为没有 deliveryDestination，不会调 Uber Direct
      expect(uberDirect.createDelivery).not.toHaveBeenCalled();
      expect(emitOrderAccepted).not.toHaveBeenCalled();
    });
  });

  it('emits paid-verified event for priority orders', () => {
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

    const dto: CreateOrderInput = {
      channel: 'web',
      fulfillmentType: 'pickup',
      paymentMethod: 'CASH',
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
      expect(emitOrderPaidVerified).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          amountCents: 1000,
          redeemValueCents: 0,
        }),
      );
      expect(uberDirect.createDelivery).not.toHaveBeenCalled();
    });
  });

  it('keeps the order and still emits event when dispatch path errors are irrelevant', async () => {
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
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'admin-1',
        phone: '+14165551234',
        language: 'ZH',
      },
    ]);

    const dto: CreateOrderInput = {
      channel: 'web',
      fulfillmentType: 'pickup',
      paymentMethod: 'CASH',
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

    expect(emitOrderPaidVerified).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-err',
        amountCents: 1000,
        redeemValueCents: 0,
      }),
    );
    expect(
      notificationService.notifyDeliveryDispatchFailed,
    ).not.toHaveBeenCalled();
  });

  it('allows createImmediatePaid with a processing checkout intent from clover flow', async () => {
    prisma.checkoutIntent.findFirst.mockResolvedValue({
      id: 'intent-1',
      referenceId: 'ref-1',
      amountCents: 1130,
      status: 'processing',
      expiresAt: new Date(Date.now() + 60_000),
      orderId: null,
      createdAt: new Date(),
    });

    prisma.order.create.mockResolvedValue({
      id: 'order-processing-intent',
      orderStableId: 'cord-processing-intent',
      status: 'paid',
      channel: 'web',
      fulfillmentType: 'pickup',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      paidAt: new Date('2024-01-01T00:00:00.000Z'),
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      pickupCode: '4321',
      clientRequestId: 'ref-1',
      items: [],
    });

    const dto: CreateOrderInput = {
      channel: 'web',
      fulfillmentType: 'pickup',
      paymentMethod: 'CARD',
      checkoutIntentId: 'ref-1',
      items: [{ productStableId: 'c1234567890abcdefghijklmn', qty: 1 }],
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
    };

    await expect(
      service.createImmediatePaid(dto, 'ref-1'),
    ).resolves.toMatchObject({
      orderStableId: 'cord-processing-intent',
    });

    expect(prisma.checkoutIntent.updateMany).toHaveBeenCalled();
    const [firstUpdateManyCall] = prisma.checkoutIntent.updateMany.mock
      .calls as Array<[{ where?: { status?: { in?: string[] } } }]>;
    expect(firstUpdateManyCall[0].where?.status?.in).toEqual(
      expect.arrayContaining(['processing', 'creating_order']),
    );
  });
});
