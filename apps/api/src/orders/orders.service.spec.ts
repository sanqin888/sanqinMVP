import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeEligibleSpendCents,
  computeTierEligibleSpendFromNetCents,
  LoyaltyService,
} from '../loyalty/loyalty.service';
import type {
  LoyaltyOrderPaidSettlementPort,
  LoyaltyOrderUsageReaderPort,
  LoyaltyPolicyReaderPort,
} from '../loyalty/public-api';
import { MembershipService } from '../membership/membership.service';
import type {
  CustomerExistenceReaderPort,
  CustomerOrderContextReaderPort,
} from '../membership/public-api';
import type { OrderBenefitsReaderPort } from '../benefits/public-api';
import type {
  DailySpecialOffersPort,
  PromotionContextReaderPort,
} from '../promotions/public-api';
import type { LocationGeocoderPort } from '../location/public-api';
import type {
  CatalogOrderFactsReaderPort,
  CatalogOrderItemMaterializationFact,
} from '../menu/public-api';
import type { OrderReadyNotificationPort } from '../notifications/public-api';
import { OrderEventsBus } from './order-events.bus';
import { OrderReadyNotificationUseCase } from './order-ready-notification.use-case';
import { DeliveryType } from '@prisma/client';
import { CreateOrderInput } from '@shared/order';
import { OrderItemSnapshotBuilder } from './order-item-snapshot.builder';
import type {
  BrandStoreConfigReaderPort,
  StoreConfigSnapshot,
} from '../store/public-api';

const demoProductId = 'c1234567890abcdefghijklmn';

const defaultCatalogOrderItemFact: CatalogOrderItemMaterializationFact = {
  stableId: demoProductId,
  nameEn: 'Demo Product',
  nameZh: null,
  basePriceCents: 1000,
  isAvailable: true,
  tempUnavailableUntil: null,
  fixedComponents: [],
  optionGroups: [],
};

const defaultStoreConfigSnapshot: StoreConfigSnapshot = {
  storeStableId: '4750_Yonge_Street',
  storeName: 'SanQ Roujiamo - Yonge',
  isActive: true,
  timezone: 'America/Toronto',
  isTemporarilyClosed: false,
  temporaryCloseReason: null,
  publicNotice: null,
  publicNoticeEn: null,
  deliveryBaseFeeCents: 600,
  priorityPerKmCents: 100,
  maxDeliveryRangeKm: 10,
  priorityDefaultDistanceKm: 6,
  latitude: null,
  longitude: null,
  addressLine1: '4750 Yonge St.',
  addressLine2: 'Unit 138',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M2N 5M6',
  countryCode: 'CA',
  phone: '+1-437-808-6888',
  contactName: 'San Qin',
  salesTaxRate: 0.13,
  enableUberDirect: true,
  autoAcceptOnlineOrders: true,
  allergyHandlingMode: 'RELAY_ALL',
  unsupportedAllergens: [],
};

const withFinancialSnapshotDefaults = <T extends Record<string, unknown>>(
  order: T,
) => {
  const subtotalCents =
    typeof order.subtotalCents === 'number' ? order.subtotalCents : 0;
  const totalCents = typeof order.totalCents === 'number' ? order.totalCents : 0;
  return {
    storeId: '4750_Yonge_Street',
    updatedAt: new Date('2026-09-12T12:00:00.000Z'),
    paymentMethod: 'CASH',
    subtotalCents,
    subtotalAfterDiscountCents: subtotalCents,
    couponDiscountCents: 0,
    loyaltyRedeemCents: 0,
    taxCents: 0,
    deliveryFeeCents: 0,
    creditCardSurchargeCents: 0,
    totalCents,
    paymentTotalCents: totalCents,
    couponTitleSnapshot: null,
    promotionSnapshot: null,
    items: [],
    ...order,
  };
};

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    $transaction: jest.Mock;
    order: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    userCoupon: {
      findFirst: jest.Mock;
    };
    checkoutIntent: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    opsEvent: {
      createMany: jest.Mock;
    };
  };
  let brandStoreConfigReader: {
    getConfiguredStoreSnapshot: jest.Mock;
  };
  let loyalty: {
    peekBalanceMicro: jest.Mock;
    getAvailablePaymentTender: jest.Mock;
    maxRedeemableCentsFromBalance: jest.Mock;
    reserveRedeemForOrder: jest.Mock;
    resolveUserIdByStableId: jest.Mock;
    deductBalanceForOrder: jest.Mock;
    rollbackOnRefund: jest.Mock;
  };
  let loyaltyOrderPaidSettlement: { settleOrderPaid: jest.Mock };
  let loyaltyOrderUsageReader: { getOrderUsage: jest.Mock };
  let loyaltyPolicyReader: {
    getLoyaltyPolicySnapshot: jest.Mock;
  };
  let membership: {
    validateCouponForOrder: jest.Mock;
    reserveCouponForOrder: jest.Mock;
    releaseCouponForOrder: jest.Mock;
    markCouponUsedForOrder: jest.Mock;
  };
  let customerExistence: { customerExists: jest.Mock };
  let orderBenefitsReader: {
    validateCouponForOrder: jest.Mock;
    getAvailablePaymentTender: jest.Mock;
    getLoyaltyOnlyRedeemCapacityCents: jest.Mock;
  };
  let customerOrderContext: {
    getOrderCustomerContext: jest.Mock;
    getSavedDeliveryAddress: jest.Mock;
  };
  let promotions: { getOrderPromotionContext: jest.Mock };
  let dailySpecialOffers: { getActiveDailySpecials: jest.Mock };
  let catalogOrderFacts: {
    findHiddenMenuItemStableIds: jest.Mock;
    getOrderItemMaterializationFacts: jest.Mock;
    getActiveOrderItemMaterializationFact: jest.Mock;
    getOrderLabelConfigs: jest.Mock;
  };
  let locationGeocoder: { geocode: jest.Mock };
  let orderReadyNotification: { notifyOrderReady: jest.Mock };
  let orderReadyNotificationUseCase: OrderReadyNotificationUseCase;
  let orderEventsBus: OrderEventsBus;
  let orderItemSnapshotBuilder: OrderItemSnapshotBuilder;
  let emitOrderPaidVerified: jest.SpiedFunction<
    OrderEventsBus['emitOrderPaidVerified']
  >;
  beforeEach(() => {
    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          Promise.resolve(callback(prisma)),
        ),
      order: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
      userCoupon: {
        findFirst: jest.fn(),
      },
      checkoutIntent: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      opsEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest
        .fn()
        .mockResolvedValue(defaultStoreConfigSnapshot),
    };

    loyalty = {
      peekBalanceMicro: jest.fn().mockResolvedValue(0n),
      getAvailablePaymentTender: jest
        .fn()
        .mockResolvedValue({ pointsMicro: 0n, balanceCents: 0 }),
      maxRedeemableCentsFromBalance: jest.fn().mockResolvedValue(0),
      reserveRedeemForOrder: jest.fn().mockResolvedValue(0),
      resolveUserIdByStableId: jest.fn(),
      deductBalanceForOrder: jest.fn().mockResolvedValue(undefined),
      rollbackOnRefund: jest.fn(),
    };
    loyaltyOrderPaidSettlement = {
      settleOrderPaid: jest.fn().mockResolvedValue(undefined),
    };
    loyaltyOrderUsageReader = {
      getOrderUsage: jest
        .fn()
        .mockResolvedValue({ balancePaidCents: 0, pointsEarned: 0 }),
    };
    loyaltyPolicyReader = {
      getLoyaltyPolicySnapshot: jest.fn().mockResolvedValue({
        earnPtPerDollar: 0.01,
        redeemDollarPerPoint: 1,
        referralPtPerDollar: 0.01,
        tierThresholdCents: {
          SILVER: 100000,
          GOLD: 1000000,
          PLATINUM: 3000000,
        },
        tierMultipliers: {
          BRONZE: 1,
          SILVER: 2,
          GOLD: 3,
          PLATINUM: 5,
        },
      }),
    };

    membership = {
      validateCouponForOrder: jest.fn().mockResolvedValue(null),
      reserveCouponForOrder: jest.fn(),
      releaseCouponForOrder: jest.fn(),
      markCouponUsedForOrder: jest.fn(),
    };
    customerExistence = {
      customerExists: jest.fn().mockResolvedValue(true),
    };
    orderBenefitsReader = {
      validateCouponForOrder: jest.fn().mockResolvedValue(null),
      getAvailablePaymentTender: jest.fn().mockResolvedValue({
        balanceCents: 0,
        maxRedeemableCents: 0,
      }),
      getLoyaltyOnlyRedeemCapacityCents: jest.fn().mockResolvedValue(0),
    };
    customerOrderContext = {
      getOrderCustomerContext: jest.fn().mockResolvedValue(null),
      getSavedDeliveryAddress: jest.fn().mockResolvedValue(null),
    };

    promotions = {
      getOrderPromotionContext: jest.fn().mockResolvedValue({
        rules: [],
        now: null,
      }),
    };
    dailySpecialOffers = {
      getActiveDailySpecials: jest.fn().mockResolvedValue({ specials: [] }),
    };
    catalogOrderFacts = {
      findHiddenMenuItemStableIds: jest.fn().mockResolvedValue([]),
      getOrderItemMaterializationFacts: jest
        .fn()
        .mockImplementation((stableIds: string[]) =>
          Promise.resolve(
            stableIds.map((stableId) => ({
              ...defaultCatalogOrderItemFact,
              stableId,
            })),
          ),
        ),
      getActiveOrderItemMaterializationFact: jest.fn().mockResolvedValue(null),
      getOrderLabelConfigs: jest.fn().mockResolvedValue([]),
    };

    locationGeocoder = {
      geocode: jest.fn().mockResolvedValue({
        latitude: 43.6532,
        longitude: -79.3832,
      }),
    };

    orderReadyNotification = {
      notifyOrderReady: jest.fn().mockResolvedValue({
        ok: true,
        finalChannel: 'sms',
        attemptedChannels: ['sms'],
      }),
    };
    orderReadyNotificationUseCase = new OrderReadyNotificationUseCase(
      prisma as unknown as PrismaService,
      customerOrderContext as unknown as CustomerOrderContextReaderPort,
      orderReadyNotification as unknown as OrderReadyNotificationPort,
    );

    orderEventsBus = new OrderEventsBus();
    orderItemSnapshotBuilder = new OrderItemSnapshotBuilder(
      catalogOrderFacts as unknown as CatalogOrderFactsReaderPort,
    );
    emitOrderPaidVerified = jest
      .spyOn(orderEventsBus, 'emitOrderPaidVerified')
      .mockImplementation(() => undefined);

    service = new OrdersService(
      prisma as unknown as PrismaService,
      brandStoreConfigReader as unknown as BrandStoreConfigReaderPort,
      loyalty as unknown as LoyaltyService,
      loyaltyOrderPaidSettlement as unknown as LoyaltyOrderPaidSettlementPort,
      loyaltyOrderUsageReader as unknown as LoyaltyOrderUsageReaderPort,
      loyaltyPolicyReader as unknown as LoyaltyPolicyReaderPort,
      membership as unknown as MembershipService,
      customerExistence as unknown as CustomerExistenceReaderPort,
      orderBenefitsReader as unknown as OrderBenefitsReaderPort,
      customerOrderContext as unknown as CustomerOrderContextReaderPort,
      promotions as unknown as PromotionContextReaderPort,
      dailySpecialOffers as unknown as DailySpecialOffersPort,
      catalogOrderFacts as unknown as CatalogOrderFactsReaderPort,
      locationGeocoder as unknown as LocationGeocoderPort,
      orderReadyNotificationUseCase as unknown as OrderReadyNotificationUseCase,
      orderEventsBus,
      orderItemSnapshotBuilder as unknown as OrderItemSnapshotBuilder,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads delivery and tax pricing through the Brand/Store config boundary', async () => {
    brandStoreConfigReader.getConfiguredStoreSnapshot.mockResolvedValue({
      ...defaultStoreConfigSnapshot,
      deliveryBaseFeeCents: 725,
      priorityPerKmCents: 135,
      maxDeliveryRangeKm: 12.5,
      priorityDefaultDistanceKm: 3,
      latitude: 43.7,
      longitude: -79.4,
      salesTaxRate: 0.15,
      enableUberDirect: false,
    });
    const internalService = service as unknown as {
      getStorePricingConfig: () => Promise<{
        deliveryBaseFeeCents: number;
        priorityPerKmCents: number;
        salesTaxRate: number;
        maxDeliveryRangeKm: number;
        priorityDefaultDistanceKm: number;
        storeLatitude: number | null;
        storeLongitude: number | null;
        enableUberDirect: boolean;
      }>;
    };

    await expect(internalService.getStorePricingConfig()).resolves.toEqual({
      deliveryBaseFeeCents: 725,
      priorityPerKmCents: 135,
      salesTaxRate: 0.15,
      maxDeliveryRangeKm: 12.5,
      priorityDefaultDistanceKm: 3,
      storeLatitude: 43.7,
      storeLongitude: -79.4,
      enableUberDirect: false,
    });
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
  });

  it('reads daily-special pricing through the Offers capability', async () => {
    const internalService = service as unknown as {
      calculateLineItems: (
        items: Array<{ productId: string; qty: number }>,
      ) => Promise<unknown>;
    };

    await internalService.calculateLineItems([
      { productId: demoProductId, qty: 1 },
    ]);

    expect(dailySpecialOffers.getActiveDailySpecials).toHaveBeenCalledWith([
      { itemStableId: demoProductId, basePriceCents: 1000 },
    ]);
    expect('menuDailySpecial' in prisma).toBe(false);
  });

  it('delegates loyalty order-usage projection by stable Order identity', async () => {
    loyaltyOrderUsageReader.getOrderUsage.mockResolvedValue({
      balancePaidCents: 125,
      pointsEarned: 2,
    });
    const internalService = service as unknown as {
      getLoyaltyUsageByOrderStableId: (orderStableId: string) => Promise<{
        balancePaidCents: number;
        pointsEarned: number;
      }>;
    };

    await expect(
      internalService.getLoyaltyUsageByOrderStableId('order-stable-usage'),
    ).resolves.toEqual({ balancePaidCents: 125, pointsEarned: 2 });
    expect(loyaltyOrderUsageReader.getOrderUsage).toHaveBeenCalledWith({
      orderStableId: 'order-stable-usage',
    });
    expect('loyaltyLedger' in prisma).toBe(false);
  });

  it('uses Promotion Engine as the coupon min-spend eligibility source', async () => {
    const userStableId = 'c2234567890abcdefghijklmn';
    const couponStableId = 'c3234567890abcdefghijklmn';
    orderBenefitsReader.validateCouponForOrder.mockResolvedValue({
      coupon: {
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
        items: [{ productStableId: 'c1234567890abcdefghijklmn', qty: 1 }],
      }),
    ).rejects.toThrow('order subtotal does not meet coupon rules');

    expect(orderBenefitsReader.validateCouponForOrder).toHaveBeenCalledWith({
      userStableId,
      couponStableId,
    });
  });

  it('rejects hidden menu items instead of unlocking them through coupons', async () => {
    const productStableId = 'c1234567890abcdefghijklmn';
    const userStableId = 'c2234567890abcdefghijklmn';
    catalogOrderFacts.findHiddenMenuItemStableIds.mockResolvedValueOnce([
      productStableId,
    ]);

    await expect(
      service.quoteOrderPricing({
        channel: 'web',
        fulfillmentType: 'pickup',
        userStableId,
        items: [{ productStableId, qty: 1 }],
      }),
    ).rejects.toThrow(
      'hidden menu items are not available for customer ordering',
    );

    expect(prisma.userCoupon.findFirst).not.toHaveBeenCalled();
  });

  it('uses the Benefits-owned raw loyalty capacity for loyalty-only order eligibility', async () => {
    const userStableId = 'c2234567890abcdefghijklmn';
    orderBenefitsReader.getLoyaltyOnlyRedeemCapacityCents.mockResolvedValue(
      999,
    );

    await expect(
      service.createLoyaltyOnlyOrder({
        userStableId,
        fulfillmentType: 'pickup',
        items: [{ productStableId: demoProductId, qty: 1 }],
      }),
    ).rejects.toThrow('insufficient loyalty balance');

    expect(
      orderBenefitsReader.getLoyaltyOnlyRedeemCapacityCents,
    ).toHaveBeenCalledWith(userStableId);
  });

  it('uses the Benefits policy rate for loyalty redemption in order quotes', async () => {
    const userStableId = 'c2234567890abcdefghijklmn';
    orderBenefitsReader.getAvailablePaymentTender.mockResolvedValue({
      balanceCents: 0,
      maxRedeemableCents: 1000,
    });
    loyaltyPolicyReader.getLoyaltyPolicySnapshot.mockResolvedValue({
      earnPtPerDollar: 0.01,
      redeemDollarPerPoint: 0.5,
      referralPtPerDollar: 0.01,
      tierThresholdCents: {
        SILVER: 100000,
        GOLD: 1000000,
        PLATINUM: 3000000,
      },
      tierMultipliers: {
        BRONZE: 1,
        SILVER: 2,
        GOLD: 3,
        PLATINUM: 5,
      },
    });

    const quote = await service.quoteOrderPricing({
      channel: 'web',
      fulfillmentType: 'pickup',
      userStableId,
      pointsToRedeem: 4,
      items: [{ productStableId: 'c1234567890abcdefghijklmn', qty: 1 }],
    });

    expect(quote.loyaltyRedeemCents).toBe(200);
    expect(quote.taxCents).toBe(104);
    expect(quote.totalCents).toBe(904);
    expect(loyaltyPolicyReader.getLoyaltyPolicySnapshot).toHaveBeenCalledTimes(
      1,
    );
  });

  it('keeps hidden menu items available to the in-store POS channel', async () => {
    const productStableId = 'c1234567890abcdefghijklmn';
    catalogOrderFacts.findHiddenMenuItemStableIds.mockResolvedValueOnce([
      productStableId,
    ]);

    const quote = await service.quoteOrderPricing({
      channel: 'in_store',
      fulfillmentType: 'pickup',
      items: [{ productStableId, qty: 1 }],
    });

    expect(quote.subtotalCents).toBe(1000);
    expect(quote.totalCents).toBe(1130);
  });

  it('maps only SanQ-priced order channels into PromotionRule applicability', async () => {
    await service.quoteOrderPricing({
      channel: 'web',
      fulfillmentType: 'pickup',
      items: [{ productStableId: demoProductId, qty: 1 }],
    });

    expect(promotions.getOrderPromotionContext).toHaveBeenCalledWith('web');

    promotions.getOrderPromotionContext.mockClear();
    const uberQuote = await service.quoteOrderPricing({
      channel: 'ubereats',
      fulfillmentType: 'pickup',
      items: [{ productStableId: demoProductId, qty: 1 }],
    });

    expect(promotions.getOrderPromotionContext).not.toHaveBeenCalled();
    expect(uberQuote.automaticPromotionDiscountCents).toBe(0);
  });

  it('applies automatic promotions and keeps POS manual discount in server pricing', async () => {
    promotions.getOrderPromotionContext.mockResolvedValue({
      now: DateTime.fromISO('2026-08-21T12:00:00', {
        zone: 'America/Toronto',
      }),
      rules: [
        {
          stableId: 'auto-10',
          titleZh: '自动九折',
          titleEn: 'Automatic 10% off',
          type: 'PERCENTAGE_OFF',
          status: 'ACTIVE',
          priority: 175,
          stackingPolicy: 'STACKABLE',
          excludesCoupons: false,
          excludesItemPromotions: false,
          channels: ['in_store'],
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
          config: { discountPercent: 10 },
        },
      ],
    });

    const quote = await service.quoteOrderPricing({
      channel: 'in_store',
      fulfillmentType: 'pickup',
      discountCents: 50,
      items: [{ productStableId: 'c1234567890abcdefghijklmn', qty: 1 }],
    });

    expect(quote.subtotalCents).toBe(1000);
    expect(quote.automaticPromotionDiscountCents).toBe(100);
    expect(quote.posManualDiscountCents).toBe(50);
    expect(quote.couponDiscountCents).toBe(0);
    expect(quote.appliedDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          promotionStableId: 'auto-10',
          source: 'AUTOMATIC_PROMOTION',
          titleZh: '自动九折',
          titleEn: 'Automatic 10% off',
          discountCents: 100,
        }),
      ]),
    );
    expect(quote.totalCents).toBe(961);
    expect(promotions.getOrderPromotionContext).toHaveBeenCalledWith(
      'in_store',
    );
  });

  it('quotes same-item BOGO for POS and keeps the manual discount stacked', async () => {
    promotions.getOrderPromotionContext.mockResolvedValue({
      now: DateTime.fromISO('2026-09-04T12:00:00', {
        zone: 'America/Toronto',
      }),
      rules: [
        {
          stableId: 'bogo-1',
          titleZh: '买一送一',
          titleEn: 'Buy 1 Get 1 Free',
          type: 'BUY_X_GET_Y',
          status: 'ACTIVE',
          priority: 175,
          stackingPolicy: 'EXCLUSIVE',
          excludesCoupons: true,
          excludesItemPromotions: true,
          channels: ['in_store'],
          validFrom: null,
          validTo: null,
          weekdays: [],
          startMinutes: null,
          endMinutes: null,
          config: {
            membersOnly: false,
            buyItemStableIds: [demoProductId],
            buyQuantity: 1,
            getItemStableIds: [demoProductId],
            getQuantity: 1,
            discountPercent: 100,
          },
        },
      ],
    });

    const quote = await service.quoteOrderPricing(
      {
        channel: 'in_store',
        fulfillmentType: 'pickup',
        discountCents: 100,
        items: [{ productStableId: demoProductId, qty: 2, unitPrice: 10 }],
      },
      { allowCustomUnitPrice: true },
    );

    expect(quote.subtotalCents).toBe(2000);
    expect(quote.automaticPromotionDiscountCents).toBe(1000);
    expect(quote.posManualDiscountCents).toBe(100);
    expect(quote.taxCents).toBe(117);
    expect(quote.totalCents).toBe(1017);
    expect(quote.appliedDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'AUTOMATIC_PROMOTION',
          discountCents: 1000,
        }),
        expect.objectContaining({
          source: 'POS_MANUAL_DISCOUNT',
          discountCents: 100,
        }),
      ]),
    );
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

    expect(orderReadyNotification.notifyOrderReady).toHaveBeenCalledTimes(1);
    expect(orderReadyNotification.notifyOrderReady).toHaveBeenCalledWith({
      email: null,
      phone: '+14165550000',
      orderNumber: 'cordpickupready001',
      name: 'Test',
      locale: 'en',
      userStableId: null,
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
    orderReadyNotification.notifyOrderReady.mockResolvedValueOnce({
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
        userStableId: 'user-stable-1',
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
    customerOrderContext.getOrderCustomerContext.mockResolvedValue({
      userStableId: 'user-stable-1',
      verifiedEmail: 'member@example.com',
      verifiedPhone: null,
      language: 'EN',
    });

    await service.updateStatusInternal(
      '33333333-3333-3333-3333-333333333333',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(orderReadyNotification.notifyOrderReady).toHaveBeenCalledTimes(1);
    expect(orderReadyNotification.notifyOrderReady).toHaveBeenCalledWith({
      email: 'checkout@example.com',
      phone: '+14165550000',
      orderNumber: 'cordpickupready002',
      name: 'Email Test',
      locale: 'en',
      userStableId: 'user-stable-1',
    });
    expect(customerOrderContext.getOrderCustomerContext).toHaveBeenCalledTimes(
      1,
    );
    expect(customerOrderContext.getOrderCustomerContext).toHaveBeenCalledWith(
      'user-stable-1',
    );
  });

  it('falls back to the member email for a historical order with persisted userStableId', async () => {
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
        userStableId: 'user-stable-member',
        fulfillmentType: 'pickup',
        items: [],
      });
    prisma.checkoutIntent.findFirst.mockResolvedValue({ locale: 'en' });
    customerOrderContext.getOrderCustomerContext.mockResolvedValue({
      userStableId: 'user-stable-member',
      verifiedEmail: 'member@example.com',
      verifiedPhone: null,
      language: 'EN',
    });

    await service.updateStatusInternal(
      '55555555-5555-5555-5555-555555555555',
      'ready',
    );
    await new Promise<void>((resolve) => process.nextTick(resolve));

    expect(orderReadyNotification.notifyOrderReady).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'member@example.com',
        phone: null,
        userStableId: 'user-stable-member',
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

    expect(orderReadyNotification.notifyOrderReady).not.toHaveBeenCalled();
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
    orderReadyNotification.notifyOrderReady.mockRejectedValueOnce(
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

    expect(orderReadyNotification.notifyOrderReady).not.toHaveBeenCalled();
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

  it('keeps the guarded paid -> making status write without emitting a second first-print path', async () => {
    const paidAt = new Date('2026-09-05T20:00:00.000Z');
    let updateManyInput: unknown;
    prisma.order.updateMany.mockImplementation((input: unknown) => {
      updateManyInput = input;
      return Promise.resolve({ count: 1 });
    });
    prisma.order.findUnique
      .mockResolvedValueOnce({
        status: 'paid',
        paidAt,
        makingAt: null,
        fulfillmentType: 'pickup',
      })
      .mockResolvedValueOnce({
        id: '8a3d4c0e-4750-4f6a-9138-000000000111',
        orderStableId: 'order_stable_fast_path_1',
        status: 'making',
        paidAt,
        makingAt: new Date('2026-09-05T20:01:00.000Z'),
        fulfillmentType: 'pickup',
        items: [],
      });

    await service.updateStatusInternal(
      '8a3d4c0e-4750-4f6a-9138-000000000111',
      'making',
    );

    const updateArgs = updateManyInput as {
      where: { id: string; status: string };
      data: { status: string; makingAt: unknown };
    };
    expect(updateArgs.where).toEqual({
      id: '8a3d4c0e-4750-4f6a-9138-000000000111',
      status: 'paid',
    });
    expect(updateArgs.data.status).toBe('making');
    expect(updateArgs.data.makingAt).toBeInstanceOf(Date);
    expect(emitOrderPaidVerified).not.toHaveBeenCalled();
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
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults(storedOrder),
    );

    return service.create(dto).then((order) => {
      // ✅ 仍然建单
      expect(prisma.order.create).toHaveBeenCalled();
      expect(order.orderStableId).toBe('cord-no-dest');

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
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults(storedOrder),
    );

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
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults({
        id: 'order-store-routing',
        orderStableId: 'stable-store-routing',
        channel: 'web',
        fulfillmentType: 'pickup',
        status: 'paid',
        paidAt: new Date(),
        createdAt: new Date(),
        paymentMethod: 'CASH',
        items: [],
      }),
    );

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
      expect(prisma.opsEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventName: 'order.financial_sale.v1',
            source: 'orders.financial',
          }) as unknown,
        }),
      );
      expect(prisma.opsEvent.createMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventName: 'order.accepted',
          }) as unknown,
        }),
      );
    } finally {
      if (originalStoreId === undefined) delete process.env.STORE_ID;
      else process.env.STORE_ID = originalStoreId;
    }
  });

  it('POS 门店建单持久化 authenticated storeStableId 而不是 deployment default', async () => {
    const originalStoreId = process.env.STORE_ID;
    process.env.STORE_ID = 'deployment-default-store';
    let createdOrderStableId = '';
    prisma.order.create.mockImplementation(
      (args: { data: { orderStableId: string } }) => {
        createdOrderStableId = args.data.orderStableId;
        return Promise.resolve(
          withFinancialSnapshotDefaults({
            id: 'pos-store-order',
            orderStableId: createdOrderStableId,
            channel: 'in_store',
            fulfillmentType: 'pickup',
            status: 'paid',
            paidAt: new Date(),
            createdAt: new Date(),
            paymentMethod: 'CASH',
            items: [],
          }),
        );
      },
    );

    try {
      await service.createForStore(
        {
          channel: 'in_store',
          fulfillmentType: 'pickup',
          contactName: 'POS Customer',
          paymentMethod: 'CASH',
          items: [],
        },
        ' authenticated-store ',
      );

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'authenticated-store',
          }) as unknown,
        }),
      );
      expect(createdOrderStableId).toBeTruthy();
      expect(prisma.opsEvent.createMany).toHaveBeenCalledWith({
        data: {
          idempotencyKey: `order.accepted:${createdOrderStableId}`,
          eventName: 'order.accepted',
          source: 'orders.lifecycle',
          payload: { orderStableId: createdOrderStableId },
        },
        skipDuplicates: true,
      });
    } finally {
      if (originalStoreId === undefined) delete process.env.STORE_ID;
      else process.env.STORE_ID = originalStoreId;
    }
  });

  it('POS 现金建单持久化服务端确认的实收与找零快照', async () => {
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults({
        id: 'pos-cash-order',
        orderStableId: 'pos-cash-order-stable',
        channel: 'in_store',
        fulfillmentType: 'pickup',
        status: 'paid',
        paidAt: new Date(),
        createdAt: new Date(),
        paymentMethod: 'CASH',
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1129,
        items: [],
      }),
    );

    await service.createForStore(
      {
        channel: 'in_store',
        fulfillmentType: 'pickup',
        paymentMethod: 'CASH',
        cashReceivedCents: 2000,
        discountCents: 1,
        items: [{ productStableId: demoProductId, qty: 1 }],
      },
      '4750_Yonge_Street',
    );

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCents: 1129,
          paymentBreakdownJson: {
            cashReceivedCents: 2000,
            cashChangeCents: 870,
          },
        }) as unknown,
      }),
    );
  });

  it('POS 余额加现金按剩余现金应付计算找零，而不是按整个订单总额', async () => {
    loyalty.resolveUserIdByStableId.mockResolvedValue(
      '00000000-0000-4000-8000-000000000099',
    );
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults({
        id: 'pos-mixed-cash-order',
        orderStableId: 'pos-mixed-cash-order-stable',
        channel: 'in_store',
        fulfillmentType: 'pickup',
        status: 'paid',
        paidAt: new Date(),
        createdAt: new Date(),
        paymentMethod: 'CASH',
        subtotalCents: 1000,
        taxCents: 130,
        totalCents: 1129,
        items: [],
      }),
    );

    await service.createForStore(
      {
        channel: 'in_store',
        fulfillmentType: 'pickup',
        paymentMethod: 'CASH',
        userStableId: demoProductId,
        balanceUsedCents: 500,
        cashReceivedCents: 1000,
        discountCents: 1,
        items: [{ productStableId: demoProductId, qty: 1 }],
      },
      '4750_Yonge_Street',
    );

    expect(loyalty.deductBalanceForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 500 }),
    );
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCents: 1129,
          paymentBreakdownJson: {
            cashReceivedCents: 1000,
            cashChangeCents: 370,
          },
        }) as unknown,
      }),
    );
  });

  it('POS 现金实收低于服务端确认应付金额时拒绝建单', async () => {
    await expect(
      service.createForStore(
        {
          channel: 'in_store',
          fulfillmentType: 'pickup',
          paymentMethod: 'CASH',
          cashReceivedCents: 1000,
          items: [{ productStableId: demoProductId, qty: 1 }],
        },
        '4750_Yonge_Street',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('通用 create 不允许非 Web 调用绕过 authenticated store context', async () => {
    await expect(
      service.create({
        channel: 'in_store',
        fulfillmentType: 'pickup',
        paymentMethod: 'CASH',
        items: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
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
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults(storedOrder),
    );

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
      expect(loyaltyOrderPaidSettlement.settleOrderPaid).toHaveBeenCalledWith({
        orderStableId: 'cord-1',
        subtotalCents: 1000,
        redeemValueCents: 0,
        earnMultiplier: 1,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot calculate dynamic delivery fee (missing coords)',
        ),
      );
    });
  });

  it('keeps the order and emits paid-verified when priority delivery uses fee fallback', async () => {
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
    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults(storedOrder),
    );

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

    prisma.order.create.mockResolvedValue(
      withFinancialSnapshotDefaults({
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
      }),
    );

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

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentBreakdownJson: {
            pointsCents: 0,
            balanceCents: 0,
            externalCents: 1130,
          },
        }) as unknown,
      }),
    );
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
        userStableId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: '(416) 555-0199',
        userStableId: 'c2234567890abcdefghijklmn',
        requirePhone: true,
      }),
    ).resolves.toBe('+14165550199');
    expect(customerOrderContext.getOrderCustomerContext).not.toHaveBeenCalled();
  });

  it('外送未填写号码时仅回退到会员已验证号码', async () => {
    customerOrderContext.getOrderCustomerContext.mockResolvedValue({
      userStableId: 'c2234567890abcdefghijklmn',
      verifiedEmail: null,
      verifiedPhone: '4165550188',
      language: 'EN',
    });
    const resolver = service as unknown as {
      resolveDeliveryPhone(params: {
        submittedPhone?: string | null;
        userStableId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: null,
        userStableId: 'c2234567890abcdefghijklmn',
        requirePhone: true,
      }),
    ).resolves.toBe('+14165550188');
  });

  it('外送没有本单号码或会员已验证号码时拒绝', async () => {
    customerOrderContext.getOrderCustomerContext.mockResolvedValue({
      userStableId: 'c2234567890abcdefghijklmn',
      verifiedEmail: null,
      verifiedPhone: null,
      language: 'EN',
    });
    const resolver = service as unknown as {
      resolveDeliveryPhone(params: {
        submittedPhone?: string | null;
        userStableId?: string;
        requirePhone: boolean;
      }): Promise<string | undefined>;
    };

    await expect(
      resolver.resolveDeliveryPhone({
        submittedPhone: null,
        userStableId: 'c2234567890abcdefghijklmn',
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

describe('loyalty spend bases', () => {
  it('keeps Store Balance eligible for member points but excludes it from tier and referral spend', () => {
    expect(
      computeEligibleSpendCents({
        subtotalCents: 5000,
        redeemValueCents: 0,
        balanceUsedCents: 2000,
      }),
    ).toEqual({
      earnCents: 5000,
      tierCents: 3000,
      referralCents: 3000,
    });
  });

  it('excludes both redeemed points and Store Balance from tier spend', () => {
    expect(
      computeEligibleSpendCents({
        subtotalCents: 5000,
        redeemValueCents: 500,
        balanceUsedCents: 2000,
      }),
    ).toEqual({
      earnCents: 4500,
      tierCents: 2500,
      referralCents: 2500,
    });
  });

  it('never makes tier spend negative when Store Balance covers the eligible order amount', () => {
    expect(computeTierEligibleSpendFromNetCents(1500, 2000)).toBe(0);
  });

  it('supports amendment deltas without double-counting original Store Balance funding', () => {
    const originalTierSpend = computeTierEligibleSpendFromNetCents(5000, 2000);
    const reducedTierSpend = computeTierEligibleSpendFromNetCents(4000, 2000);
    const increasedTierSpend = computeTierEligibleSpendFromNetCents(6000, 2000);

    expect(originalTierSpend).toBe(3000);
    expect(reducedTierSpend - originalTierSpend).toBe(-1000);
    expect(increasedTierSpend - originalTierSpend).toBe(1000);
  });
});
