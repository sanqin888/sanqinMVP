import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { UberDirectService } from '../deliveries/uber-direct.service';
import { MembershipService } from '../membership/membership.service';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailService } from '../email/email.service';
import { OrderEventsBus } from '../messaging/order-events.bus';
import { DeliveryType } from '@prisma/client';
import { CreateOrderInput } from '@shared/order';
import type { PrintPosPayloadService } from './print-pos-payload.service';

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
      updateMany: jest.Mock;
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
    userCoupon: {
      findFirst: jest.Mock;
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
  let locationService: { geocode: jest.Mock };
  let notificationService: {
    notifyOrderReady: jest.Mock;
    notifyDeliveryDispatchFailed: jest.Mock;
  };
  let emailService: { sendOrderInvoice: jest.Mock };
  let orderEventsBus: OrderEventsBus;
  let printPosPayloadService: { getByStableId: jest.Mock };
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      userCoupon: {
        findFirst: jest.fn(),
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

    locationService = {
      geocode: jest.fn().mockResolvedValue({
        latitude: 43.6532,
        longitude: -79.3832,
      }),
    };

    notificationService = {
      notifyOrderReady: jest.fn().mockResolvedValue({
        ok: true,
        finalChannel: 'sms',
        attemptedChannels: ['sms'],
      }),
      notifyDeliveryDispatchFailed: jest.fn().mockResolvedValue({ ok: true }),
    };

    emailService = {
      sendOrderInvoice: jest.fn(),
    };

    orderEventsBus = new OrderEventsBus();
    printPosPayloadService = {
      getByStableId: jest.fn(),
    };
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
      locationService as unknown as LocationService,
      notificationService as unknown as NotificationService,
      emailService as unknown as EmailService,
      orderEventsBus,
      printPosPayloadService as unknown as PrintPosPayloadService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses Promotion Engine as the coupon min-spend eligibility source', async () => {
    const userStableId = 'c2234567890abcdefghijklmn';
    const couponStableId = 'c3234567890abcdefghijklmn';
    loyalty.resolveUserIdByStableId.mockResolvedValue('user-1');
    membership.validateCouponForOrder.mockResolvedValue({
      coupon: {
        id: '11111111-1111-1111-1111-111111111111',
        couponStableId,
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: 2000,
        unlockedItemStableIds: [],
        stackingPolicy: 'STACKABLE',
      },
    });

    await expect(
      service.quoteOrderPricing({
        channel: 'web',
        fulfillmentType: 'pickup',
        userStableId,
        couponStableId,
        items: [
          { productStableId: 'c1234567890abcdefghijklmn', qty: 1 },
        ],
      }),
    ).rejects.toThrow('order subtotal does not meet coupon rules');

    expect(membership.validateCouponForOrder).toHaveBeenCalledWith({
      userId: 'user-1',
      couponStableId,
    });
  });

  it('routes hidden-item entitlement coupon conflicts through Promotion Engine', async () => {
    const productStableId = 'c1234567890abcdefghijklmn';
    const userStableId = 'c2234567890abcdefghijklmn';
    const couponStableId = 'c3234567890abcdefghijklmn';
    loyalty.resolveUserIdByStableId.mockResolvedValue('user-1');
    prisma.menuItem.findMany
      .mockResolvedValueOnce([
        {
          id: productStableId,
          stableId: productStableId,
          basePriceCents: 1000,
          nameEn: 'Hidden Product',
          nameZh: null,
          isAvailable: true,
          visibility: 'HIDDEN',
          tempUnavailableUntil: null,
          optionGroups: [],
        },
      ])
      .mockResolvedValueOnce([{ stableId: productStableId }]);
    prisma.userCoupon.findFirst.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      couponStableId: 'c4234567890abcdefghijklmn',
      coupon: {
        couponStableId: 'c4234567890abcdefghijklmn',
        code: 'UNLOCK',
        title: 'Unlock hidden item',
        stackingPolicy: 'EXCLUSIVE',
        unlockedItemStableIds: [productStableId],
      },
    });
    membership.validateCouponForOrder.mockResolvedValue({
      coupon: {
        id: '11111111-1111-1111-1111-111111111111',
        couponStableId,
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: null,
        unlockedItemStableIds: [],
        stackingPolicy: 'STACKABLE',
      },
    });

    await expect(
      service.quoteOrderPricing({
        channel: 'web',
        fulfillmentType: 'pickup',
        userStableId,
        couponStableId,
        selectedUserCouponId: '22222222-2222-2222-2222-222222222222',
        items: [{ productStableId, qty: 1 }],
      }),
    ).rejects.toThrow('coupon cannot be stacked with other coupons');

    expect(membership.validateCouponForOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps the ordinary coupon discount when entitlement and coupon are both stackable', async () => {
    const productStableId = 'c1234567890abcdefghijklmn';
    const userStableId = 'c2234567890abcdefghijklmn';
    const couponStableId = 'c3234567890abcdefghijklmn';
    loyalty.resolveUserIdByStableId.mockResolvedValue('user-1');
    prisma.menuItem.findMany
      .mockResolvedValueOnce([
        {
          id: productStableId,
          stableId: productStableId,
          basePriceCents: 1000,
          nameEn: 'Hidden Product',
          nameZh: null,
          isAvailable: true,
          visibility: 'HIDDEN',
          tempUnavailableUntil: null,
          optionGroups: [],
        },
      ])
      .mockResolvedValueOnce([{ stableId: productStableId }]);
    prisma.userCoupon.findFirst.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      couponStableId: 'c4234567890abcdefghijklmn',
      coupon: {
        couponStableId: 'c4234567890abcdefghijklmn',
        code: 'UNLOCK',
        title: 'Unlock hidden item',
        stackingPolicy: 'STACKABLE',
        unlockedItemStableIds: [productStableId],
      },
    });
    membership.validateCouponForOrder.mockResolvedValue({
      coupon: {
        id: '11111111-1111-1111-1111-111111111111',
        couponStableId,
        code: 'SAVE10',
        title: 'Save 10%',
        discountCents: 0,
        discountPercent: 10,
        minSpendCents: null,
        unlockedItemStableIds: [],
        stackingPolicy: 'STACKABLE',
      },
    });

    const quote = await service.quoteOrderPricing({
      channel: 'web',
      fulfillmentType: 'pickup',
      userStableId,
      couponStableId,
      selectedUserCouponId: '22222222-2222-2222-2222-222222222222',
      items: [{ productStableId, qty: 1 }],
    });

    expect(quote.couponDiscountCents).toBe(100);
  });

  it('sends order-ready notification with phone when pickup order is marked ready and no email exists', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date('2024-01-01T00:00:00.000Z'),
        makingAt: new Date('2024-01-01T00:05:00.000Z'),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-pickup-ready',
        orderStableId: 'cordpickupready001',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: '+14165550000',
        contactName: 'Test',
        userId: null,
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({
      locale: 'en',
      metadataJson: {
        verifiedContacts: { phone: '+14165550000' },
      },
    });

    await service.updateStatusInternal(
      '11111111-1111-1111-1111-111111111111',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(notificationService.notifyOrderReady).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyOrderReady).toHaveBeenCalledWith({
      email: null,
      phone: '+14165550000',
      orderNumber: 'cordpickupready001',
      name: 'Test',
      locale: 'en',
      userId: null,
    });
    expect(logSpy).toHaveBeenCalledWith({
      event: 'order_ready_notification_completed',
      orderId: 'order-pickup-ready',
      orderStableId: 'cordpickupready001',
      finalChannel: 'sms',
      attemptedChannels: ['sms'],
      ok: true,
    });
  });

  it('logs email failure followed by successful SMS fallback', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    notificationService.notifyOrderReady.mockResolvedValueOnce({
      ok: true,
      finalChannel: 'sms',
      attemptedChannels: ['email', 'sms'],
      fallbackReason: 'provider rejected customer@example.com',
    });
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date(),
        makingAt: new Date(),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-fallback',
        orderStableId: 'cordfallback001',
        clientRequestId: null,
        contactEmail: 'customer@example.com',
        contactPhone: '+14165550000',
        contactName: 'Fallback',
        userId: null,
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({
      metadataJson: {
        verifiedContacts: {
          email: 'customer@example.com',
          phone: '+14165550000',
        },
      },
    });

    await service.updateStatusInternal(
      '12121212-1212-1212-1212-121212121212',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'order_ready_notification_completed',
        orderId: 'order-fallback',
        finalChannel: 'sms',
        attemptedChannels: ['email', 'sms'],
        ok: true,
        failureReason: 'provider rejected [redacted-email]',
      }),
    );
  });

  it('prefers the checkout email over a different member email', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date('2024-01-01T00:00:00.000Z'),
        makingAt: new Date('2024-01-01T00:05:00.000Z'),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-pickup-ready-email',
        orderStableId: 'cordpickupready002',
        clientRequestId: null,
        contactEmail: 'checkout@example.com',
        contactPhone: '+14165550000',
        contactName: 'Email Test',
        userId: 'user-1',
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({
      locale: 'en',
      metadataJson: {
        verifiedContacts: {
          email: 'checkout@example.com',
          phone: '+14165550000',
        },
      },
    });
    prisma.user.findUnique.mockResolvedValue({
      email: 'member@example.com',
      emailVerifiedAt: new Date(),
      phone: null,
      phoneVerifiedAt: null,
    });

    await service.updateStatusInternal(
      '33333333-3333-3333-3333-333333333333',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(notificationService.notifyOrderReady).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyOrderReady).toHaveBeenCalledWith({
      email: 'checkout@example.com',
      phone: '+14165550000',
      orderNumber: 'cordpickupready002',
      name: 'Email Test',
      locale: 'en',
      userId: 'user-1',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: { email: true } }),
    );
  });

  it('falls back to the member email for an old order without contactEmail', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date('2024-01-01T00:00:00.000Z'),
        makingAt: new Date('2024-01-01T00:05:00.000Z'),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'old-order',
        orderStableId: 'cordoldorder001',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: null,
        contactName: 'Old Member',
        userId: 'user-old',
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({ locale: 'en' });
    prisma.user.findUnique.mockResolvedValue({
      email: 'member@example.com',
      emailVerifiedAt: new Date(),
      phone: null,
      phoneVerifiedAt: null,
    });

    await service.updateStatusInternal(
      '55555555-5555-5555-5555-555555555555',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(notificationService.notifyOrderReady).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'member@example.com',
        phone: null,
      }),
    );
  });

  it('does not send order-ready notification when pickup order has no email or phone', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date('2024-01-01T00:00:00.000Z'),
        makingAt: new Date('2024-01-01T00:05:00.000Z'),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-pickup-ready-no-contact',
        orderStableId: 'cordpickupready003',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: null,
        contactName: 'No Contact',
        userId: null,
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({ locale: 'en' });

    await service.updateStatusInternal(
      '44444444-4444-4444-4444-444444444444',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(notificationService.notifyOrderReady).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith({
      event: 'order_ready_notification_completed',
      orderId: 'order-pickup-ready-no-contact',
      orderStableId: 'cordpickupready003',
      finalChannel: null,
      attemptedChannels: [],
      ok: false,
      failureReason: 'no_trusted_contact',
    });
  });

  it('logs a redacted structured failure when template rendering throws', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    notificationService.notifyOrderReady.mockRejectedValueOnce(
      new Error('template failed for private@example.com +1 416 555 9999'),
    );
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date(),
        makingAt: new Date(),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-template-error',
        orderStableId: 'cordtemplate001',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: '+14165550000',
        contactName: 'Private',
        userId: null,
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({
      metadataJson: { verifiedContacts: { phone: '+14165550000' } },
    });

    await service.updateStatusInternal(
      '13131313-1313-1313-1313-131313131313',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'order_ready_notification_completed',
      orderId: 'order-template-error',
      orderStableId: 'cordtemplate001',
      finalChannel: null,
      attemptedChannels: [],
      ok: false,
      failureReason: 'template failed for [redacted-email] [redacted-phone]',
    });
  });

  it('logs a structured failure when the contact database query throws', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date(),
        makingAt: new Date(),
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: 'order-db-error',
        orderStableId: 'corddberror001',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: null,
        contactName: null,
        userId: null,
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await service.updateStatusInternal(
      '14141414-1414-1414-1414-141414141414',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'order_ready_notification_completed',
      orderId: 'order-db-error',
      orderStableId: 'corddberror001',
      finalChannel: null,
      attemptedChannels: [],
      ok: false,
      failureReason: 'database unavailable',
    });
  });

  it('does not send order-ready notification when delivery order is marked ready', async () => {
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'making',
        paidAt: new Date('2024-01-01T00:00:00.000Z'),
        makingAt: new Date('2024-01-01T00:05:00.000Z'),
        fulfillmentType: 'delivery',
      })
      .mockResolvedValueOnce({
        id: 'order-delivery-ready',
        orderStableId: 'corddeliveryready001',
        clientRequestId: null,
        contactEmail: null,
        contactPhone: '+14165550000',
        contactName: 'Test',
        userId: null,
        fulfillmentType: 'delivery',
        items: [],
      });

    await service.updateStatusInternal(
      '22222222-2222-2222-2222-222222222222',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(notificationService.notifyOrderReady).not.toHaveBeenCalled();
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
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException when advancing a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.advance('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates order even when deliveryDestination is missing for priority orders', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const dto: CreateOrderInput = {
      channel: 'web',
      fulfillmentType: 'pickup',
      contactName: 'Test Customer',
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
      expect(warnSpy).toHaveBeenCalledWith(
        'Priority delivery order is missing deliveryDestination.',
      );
    });
  });

  it('normalizes and saves the checkout contact email', async () => {
    const storedOrder = {
      id: 'order-email',
      orderStableId: 'cord-email',
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

    await service.create({
      channel: 'web',
      fulfillmentType: 'pickup',
      contactName: 'Guest Customer',
      paymentMethod: 'CASH',
      subtotalCents: 1000,
      contactEmail: '  Guest@Example.COM  ',
    });

    expect(prisma.order.create).toHaveBeenCalled();
    const createMock = prisma.order.create as jest.Mock<
      unknown,
      [{ data: { contactEmail?: string | null; storeId?: string | null } }]
    >;
    expect(createMock.mock.calls[0]?.[0].data.contactEmail).toBe(
      'guest@example.com',
    );
    expect(createMock.mock.calls[0]?.[0].data.storeId).toBeTruthy();
  });

  it('网站订单仅使用服务端门店配置而忽略客户端任意 storeId', async () => {
    const originalStoreId = process.env.STORE_ID;
    process.env.STORE_ID = 'server-store';
    prisma.order.create.mockResolvedValue({
      id: 'order-store-routing',
      orderStableId: 'stable-store-routing',
      channel: 'web',
      fulfillmentType: 'pickup',
      status: 'paid',
      paidAt: new Date(),
      createdAt: new Date(),
      paymentMethod: 'CASH',
      items: [],
    });

    try {
      await service.create({
        channel: 'web',
        fulfillmentType: 'pickup',
        contactName: 'Store Customer',
        paymentMethod: 'CASH',
        items: [],
        storeId: 'client-controlled-store',
      } as CreateOrderInput & { storeId: string });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: 'server-store' }) as unknown,
        }),
      );
    } finally {
      if (originalStoreId === undefined) delete process.env.STORE_ID;
      else process.env.STORE_ID = originalStoreId;
    }
  });

  it('emits paid-verified event for priority orders', () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
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
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot calculate dynamic delivery fee (missing coords)',
        ),
      );
    });
  });

  it('keeps the order and still emits event when dispatch path errors are irrelevant', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
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
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot calculate dynamic delivery fee (missing coords)',
      ),
    );
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
      contactName: 'Card Customer',
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

  it('外送明确填写的新号码优先于会员资料号码', async () => {
    const resolver = service as unknown as {
      resolveDeliveryPhone(params: {
        submittedPhone?: string | null;
        userId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: '(416) 555-0199',
        userId: 'member-1',
        requirePhone: true,
      }),
    ).resolves.toBe('+14165550199');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('外送未填写号码时仅回退到会员已验证号码', async () => {
    prisma.user.findUnique.mockResolvedValue({
      phone: '4165550188',
      phoneVerifiedAt: new Date(),
    });
    const resolver = service as unknown as {
      resolveDeliveryPhone(params: {
        submittedPhone?: string | null;
        userId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: null,
        userId: 'member-1',
        requirePhone: true,
      }),
    ).resolves.toBe('+14165550188');
  });

  it('外送没有本单号码或会员已验证号码时拒绝', async () => {
    prisma.user.findUnique.mockResolvedValue({
      phone: '4165550188',
      phoneVerifiedAt: null,
    });
    const resolver = service as unknown as {
      resolveDeliveryPhone(params: {
        submittedPhone?: string | null;
        userId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: null,
        userId: 'member-1',
        requirePhone: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'DELIVERY_PHONE_REQUIRED' },
    });
  });

  it('按渠道隔离 Web、POS 与 Uber Eats 联系方式策略', () => {
    const policyResolver = service as unknown as {
      resolveContactPolicy(dto: CreateOrderInput): {
        requireCustomerName: boolean;
        requireVerifiedNotificationContact: boolean;
        requireDeliveryPhone: boolean;
        allowMemberVerifiedContactFallback: boolean;
        allowUnverifiedExternalContact: boolean;
      };
    };

    expect(
      policyResolver.resolveContactPolicy({
        channel: 'web',
        fulfillmentType: 'delivery',
      }),
    ).toMatchObject({
      requireCustomerName: true,
      requireVerifiedNotificationContact: true,
      requireDeliveryPhone: true,
      allowMemberVerifiedContactFallback: true,
      allowUnverifiedExternalContact: false,
    });
    expect(
      policyResolver.resolveContactPolicy({
        channel: 'in_store',
        fulfillmentType: 'pickup',
      }),
    ).toMatchObject({
      requireCustomerName: false,
      requireVerifiedNotificationContact: false,
      requireDeliveryPhone: false,
    });
    expect(
      policyResolver.resolveContactPolicy({
        channel: 'ubereats',
        fulfillmentType: 'delivery',
      }),
    ).toMatchObject({
      requireCustomerName: false,
      requireVerifiedNotificationContact: false,
      requireDeliveryPhone: false,
      allowUnverifiedExternalContact: true,
    });
  });
});
