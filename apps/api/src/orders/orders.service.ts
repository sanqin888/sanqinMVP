// apps/api/src/orders/orders.service.ts

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AppLogger } from '../common/app-logger';
import { normalizeEmail } from '../common/utils/email';
import { normalizePhone } from '../common/utils/phone';
import {
  Channel,
  DeliveryProvider,
  DeliveryType,
  FulfillmentType,
  MenuItemOptionGroup,
  MenuOptionGroupTemplate,
  MenuOptionTemplateChoice,
  PaymentMethod,
  OrderAmendmentType,
  OrderAmendmentItemAction,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  LOYALTY_POLICY_READER,
  type LoyaltyPolicyReaderPort,
} from '../loyalty/public-api';
import { MembershipService } from '../membership/membership.service';
import {
  CreateOrderInput,
  DeliveryDestinationInput,
  type OrderDiscountDisplayEntry,
} from '@shared/order';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
} from './order-status';
import { normalizeStableId } from '../common/utils/stable-id';
import { OrderSummaryDto } from './dto/order-summary.dto';
import {
  UberDirectDropoffDetails,
  UberDirectDeliveryResult,
  UberDirectPickupDetails,
  UberDirectService,
} from '../deliveries/uber-direct.service';
import {
  buildClientRequestId,
  CLIENT_REQUEST_ID_RE,
} from '../common/utils/client-request-id';
import {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';
import {
  buildOrderItemComponentDisplaySnapshots,
  buildOrderItemParentDisplayOptions,
  type OrderItemComponentSnapshot,
  type OrderItemComponentsSnapshot,
} from './order-item-components';
import { isAvailableNow } from '@shared/menu';
import {
  DAILY_SPECIAL_OFFERS,
  PROMOTION_CONTEXT_READER,
  evaluateOrderPromotions,
  type CouponPromotionLike,
  type DailySpecialOffersPort,
  type PromotionContextReaderPort,
  type PromotionOrderEvaluation,
  type PromotionRuleChannel,
  type PromotionOrderLine,
  type PromotionSource,
} from '../promotions/public-api';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailService } from '../email/email.service';
import { OrderEventsBus } from '../messaging/order-events.bus';
import type { OrderDto, OrderItemDto } from './dto/order.dto';
import { PrintPosPayloadService } from './print-pos-payload.service';
import {
  BRAND_STORE_CONFIG_READER,
  resolveConfiguredStoreStableId,
  type BrandStoreConfigReaderPort,
  type StoreConfigSnapshot,
} from '../store/public-api';
import { buildOrderPricingDisplay } from './order-pricing-display';
import {
  resolveRequestedLoyaltyPoints,
  resolveRequestedLoyaltyRedeemCents,
} from './orders-loyalty-redemption';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
type OrderItemSnapshot = Prisma.OrderItemGetPayload<{
  select: {
    productStableId: true;
    qty: true;
    displayName: true;
    nameEn: true;
    nameZh: true;
    unitPriceCents: true;
    externalSpecialInstructions: true;
    optionsJson: true;
    componentsJson: true;
  };
}>;

const orderDetailSelect = {
  orderStableId: true,
  clientRequestId: true,
  status: true,
  channel: true,
  fulfillmentType: true,
  paymentMethod: true,
  pickupCode: true,
  externalOrderNotes: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  deliveryType: true,
  deliveryProvider: true,
  deliveryEtaMinMinutes: true,
  deliveryEtaMaxMinutes: true,
  subtotalCents: true,
  taxCents: true,
  deliveryFeeCents: true,
  deliveryCostCents: true,
  deliverySubsidyCents: true,
  totalCents: true,
  paymentTotalCents: true,
  creditCardSurchargeCents: true,
  couponCodeSnapshot: true,
  couponTitleSnapshot: true,
  couponDiscountCents: true,
  loyaltyRedeemCents: true,
  subtotalAfterDiscountCents: true,
  promotionSnapshot: true,
  createdAt: true,
  paidAt: true,
  userId: true,
  items: {
    select: {
      productStableId: true,
      qty: true,
      displayName: true,
      nameEn: true,
      nameZh: true,
      unitPriceCents: true,
      externalSpecialInstructions: true,
      optionsJson: true,
      componentsJson: true,
    },
  },
} satisfies Prisma.OrderSelect;

type OrderDetail = Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>;
type OrderItemInput = NonNullable<CreateOrderInput['items']>[number] & {
  productId?: string;
  productStableId?: string;
  qty: number;
  options?: Record<string, unknown>;
};
type MenuItemWithOptions = Prisma.MenuItemGetPayload<{
  include: {
    fixedComponents: true;
    optionGroups: {
      include: {
        templateGroup: {
          include: {
            options: true;
          };
        };
      };
    };
  };
}>;
type OptionChoiceContext = {
  choice: MenuOptionTemplateChoice;
  group: MenuOptionGroupTemplate;
  link: MenuItemOptionGroup;
};
type CouponForPromotion = {
  couponStableId: string;
  code: string;
  title: string;
  discountCents: number;
  discountPercent: number | null;
  minSpendCents: number | null;
  unlockedItemStableIds: string[];
  stackingPolicy: 'EXCLUSIVE' | 'STACKABLE';
};

function toCouponPromotionLike(
  coupon: CouponForPromotion,
): CouponPromotionLike {
  return {
    couponStableId: coupon.couponStableId,
    code: coupon.code,
    title: coupon.title,
    discountCents: coupon.discountCents,
    discountPercent: coupon.discountPercent,
    minSpendCents: coupon.minSpendCents,
    unlockedItemStableIds: coupon.unlockedItemStableIds,
    stackingPolicy: coupon.stackingPolicy,
  };
}

function assertCouponPromotionAccepted(
  evaluation: PromotionOrderEvaluation,
  couponStableId: string | null | undefined,
): void {
  if (!couponStableId) return;
  const rejected = evaluation.rejected.find(
    (candidate) =>
      candidate.source === 'COUPON' &&
      candidate.promotionStableId === couponStableId,
  );
  if (!rejected) return;

  if (
    evaluation.couponEligibleLineKeys.length === 0 &&
    (rejected.code === 'MIN_SPEND_NOT_MET' ||
      rejected.code === 'NO_APPLICABLE_SUBTOTAL')
  ) {
    throw new BadRequestException(
      'coupon is not available for daily special items',
    );
  }

  switch (rejected.code) {
    case 'MIN_SPEND_NOT_MET':
      throw new BadRequestException(
        'order subtotal does not meet coupon rules',
      );
    case 'NO_APPLICABLE_SUBTOTAL':
      throw new BadRequestException('coupon does not apply to selected items');
    case 'STACKING_CONFLICT':
      throw new BadRequestException(
        'coupon cannot be stacked with other coupons',
      );
    case 'INACTIVE':
      throw new BadRequestException('coupon is not available');
  }
}

function resolvePromotionDiscountCentsBySource(
  evaluation: PromotionOrderEvaluation,
  source: PromotionSource,
): number {
  return evaluation.adjustments
    .filter((adjustment) => adjustment.source === source)
    .reduce((sum, adjustment) => sum + adjustment.discountCents, 0);
}

function resolveCouponPromotionDiscountCents(
  evaluation: PromotionOrderEvaluation,
): number {
  return resolvePromotionDiscountCentsBySource(evaluation, 'COUPON');
}

function availabilityFromDb(
  isAvailable: boolean,
  tempUnavailableUntil: Date | null,
) {
  return {
    isAvailable,
    tempUnavailableUntil: tempUnavailableUntil
      ? tempUnavailableUntil.toISOString()
      : null,
  };
}

// --- 辅助函数：解析数字环境变量 ---
function parseNumberEnv(
  envValue: string | undefined,
  fallback: number,
): number {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- 环境变量配置 ---
const DEFAULT_TAX_RATE = parseNumberEnv(process.env.SALES_TAX_RATE, 0.13);
const DEFAULT_DELIVERY_BASE_FEE_CENTS = parseNumberEnv(
  process.env.DELIVERY_BASE_FEE_CENTS,
  600,
);
const DEFAULT_PRIORITY_PER_KM_CENTS = parseNumberEnv(
  process.env.PRIORITY_DELIVERY_PER_KM_CENTS,
  100,
);
const DEFAULT_MAX_RANGE_KM = 10;
const DEFAULT_PRIORITY_DISTANCE_KM = 6;

type DeliveryPricingConfig = {
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  salesTaxRate: number;
  maxDeliveryRangeKm: number;
  priorityDefaultDistanceKm: number;
  storeLatitude: number | null;
  storeLongitude: number | null;
  enableUberDirect: boolean;
};

type OrderContactPolicy = {
  requireCustomerName: boolean;
  requireVerifiedNotificationContact: boolean;
  requireDeliveryPhone: boolean;
  allowMemberVerifiedContactFallback: boolean;
  allowUnverifiedExternalContact: boolean;
};

const PROMOTION_RULE_CHANNEL_BY_ORDER_CHANNEL = {
  web: 'web',
  in_store: 'in_store',
  ubereats: null,
} satisfies Record<CreateOrderInput['channel'], PromotionRuleChannel | null>;

function resolvePromotionRuleChannel(
  channel: CreateOrderInput['channel'],
): PromotionRuleChannel | null {
  return PROMOTION_RULE_CHANNEL_BY_ORDER_CHANNEL[channel];
}

type OrderReadyNotificationResult = {
  ok: boolean;
  finalChannel: 'email' | 'sms' | null;
  attemptedChannels: readonly ('email' | 'sms')[];
  reason?: string;
  error?: string;
  fallbackReason?: string;
  sendId?: string;
};

export type AppliedPricingDiscount = OrderDiscountDisplayEntry;

export type OrderPricingQuote = {
  subtotalCents: number;
  displaySubtotalCents: number;
  couponDiscountCents: number;
  automaticPromotionDiscountCents: number;
  posManualDiscountCents: number;
  loyaltyRedeemCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  appliedDiscounts: AppliedPricingDiscount[];
};

export type PaymentTenderAllocation = {
  pointsCents: number;
  balanceCents: number;
  couponDiscountCents: number;
  orderTotalCents: number;
  externalCents: number;
};

export type PreparedPaymentOrderItemSnapshot = {
  id: string;
  productStableId: string;
  qty: number;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  unitPriceCents: number;
  baseUnitPriceCents: number;
  optionsUnitPriceCents: number;
  isDailySpecialApplied: boolean;
  dailySpecialStableId: string | null;
  optionsJson: unknown;
  componentsJson?: unknown;
};

export type PreparedPaymentOrderSnapshot = {
  version: 1;
  order: CreateOrderInput;
  userId: string | null;
  /** Business store identity: Store.storeStableId, matching Order.storeId. */
  storeId: string;
  pricing: OrderPricingQuote;
  tender: PaymentTenderAllocation;
  items: PreparedPaymentOrderItemSnapshot[];
  promotionSnapshot: unknown;
  coupon: {
    id: string;
    couponStableId: string;
    code: string;
    title: string;
    minSpendCents: number | null;
    expiresAt: string | null;
  } | null;
  preparedAt: string;
};

export type ConfirmedPaymentOrderResult = {
  order: OrderDto;
  internalOrderId: string;
};

@Injectable()
export class OrdersService {
  private readonly logger = new AppLogger(OrdersService.name);
  private readonly CLIENT_REQUEST_ID_RE = CLIENT_REQUEST_ID_RE;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
    private readonly loyalty: LoyaltyService,
    @Inject(LOYALTY_POLICY_READER)
    private readonly loyaltyPolicyReader: LoyaltyPolicyReaderPort,
    private readonly membership: MembershipService,
    @Inject(PROMOTION_CONTEXT_READER)
    private readonly promotions: PromotionContextReaderPort,
    @Inject(DAILY_SPECIAL_OFFERS)
    private readonly dailySpecialOffers: DailySpecialOffersPort,
    private readonly uberDirect: UberDirectService,
    private readonly locationService: LocationService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly orderEventsBus: OrderEventsBus,
    private readonly printPosPayloadService: PrintPosPayloadService,
  ) {}

  private resolveContactPolicy(dto: CreateOrderInput): OrderContactPolicy {
    const requireDeliveryPhone = dto.fulfillmentType === 'delivery';

    if (dto.channel === Channel.web) {
      return {
        requireCustomerName: true,
        requireVerifiedNotificationContact: true,
        requireDeliveryPhone,
        allowMemberVerifiedContactFallback: true,
        allowUnverifiedExternalContact: false,
      };
    }

    if (dto.channel === Channel.in_store) {
      return {
        requireCustomerName: false,
        requireVerifiedNotificationContact: false,
        requireDeliveryPhone,
        allowMemberVerifiedContactFallback: true,
        allowUnverifiedExternalContact: false,
      };
    }

    return {
      requireCustomerName: false,
      requireVerifiedNotificationContact: false,
      requireDeliveryPhone: false,
      allowMemberVerifiedContactFallback: false,
      allowUnverifiedExternalContact: true,
    };
  }

  async quoteOrderPricing(
    dto: CreateOrderInput,
    options?: { allowCustomUnitPrice?: boolean },
  ): Promise<OrderPricingQuote> {
    const rawUserStableId =
      typeof dto.userStableId === 'string' ? dto.userStableId.trim() : '';
    const normalizedUserStableId = rawUserStableId
      ? normalizeStableId(rawUserStableId)
      : null;
    if (rawUserStableId && !normalizedUserStableId) {
      throw new BadRequestException('userStableId must be a cuid');
    }

    const userId = normalizedUserStableId
      ? await this.loyalty.resolveUserIdByStableId(normalizedUserStableId)
      : undefined;

    const rawCouponStableId =
      typeof dto.couponStableId === 'string' ? dto.couponStableId.trim() : '';
    const normalizedCouponStableId = rawCouponStableId
      ? normalizeStableId(rawCouponStableId)
      : null;
    if (rawCouponStableId && !normalizedCouponStableId) {
      throw new BadRequestException('couponStableId must be a cuid');
    }

    const items = dto.items ?? [];
    const { calculatedItems, calculatedSubtotal, promotionLines } =
      await this.calculateLineItems(items, {
        allowCustomUnitPrice: options?.allowCustomUnitPrice === true,
      });

    const productStableIds = Array.from(
      new Set(calculatedItems.map((item) => item.productStableId)),
    );

    const subtotalCents = calculatedSubtotal;
    const pricingConfig = await this.getStorePricingConfig();
    const deliveryRulesFallback = this.buildDeliveryFallback(pricingConfig);
    const hasLoyaltyRedemptionInput =
      Boolean(userId) &&
      (typeof dto.pointsToRedeem === 'number' ||
        typeof dto.redeemValueCents === 'number');
    const loyaltyPolicy = hasLoyaltyRedemptionInput
      ? await this.loyaltyPolicyReader.getLoyaltyPolicySnapshot()
      : null;
    const requestedPoints = loyaltyPolicy
      ? resolveRequestedLoyaltyPoints(dto, loyaltyPolicy.redeemDollarPerPoint)
      : undefined;

    const isDelivery =
      dto.fulfillmentType === 'delivery' ||
      dto.deliveryType === DeliveryType.STANDARD ||
      dto.deliveryType === DeliveryType.PRIORITY;

    let deliveryFeeCustomerCents = 0;
    const deliveryMeta = dto.deliveryType
      ? deliveryRulesFallback[dto.deliveryType]
      : undefined;

    if (isDelivery) {
      const targetType = dto.deliveryType ?? DeliveryType.PRIORITY;
      const dest = await this.resolveTrustedDeliveryDestination(dto, userId);

      if (dest) {
        dto.deliveryDestination = dest;
        const hasCoords =
          typeof dest.latitude === 'number' &&
          typeof dest.longitude === 'number';
        if (!hasCoords && (dest.addressLine1 || dest.addressLine2)) {
          const fullAddr = [
            dest.addressLine1,
            dest.addressLine2,
            dest.city,
            dest.province,
            dest.postalCode,
          ]
            .filter(Boolean)
            .join(', ');
          const coords = await this.locationService.geocode(fullAddr);
          if (coords) {
            dest.latitude = coords.latitude;
            dest.longitude = coords.longitude;
          }
        }
      }

      if (
        Number.isFinite(pricingConfig.storeLatitude ?? NaN) &&
        Number.isFinite(pricingConfig.storeLongitude ?? NaN) &&
        dest &&
        typeof dest.latitude === 'number' &&
        typeof dest.longitude === 'number'
      ) {
        const distKm = this.calculateDistanceKm(
          pricingConfig.storeLatitude as number,
          pricingConfig.storeLongitude as number,
          dest.latitude,
          dest.longitude,
        );

        deliveryFeeCustomerCents = this.calculateDynamicDeliveryFee(
          targetType,
          distKm,
          pricingConfig,
        );
      } else {
        if (deliveryMeta) {
          deliveryFeeCustomerCents = deliveryMeta.feeCents;
        }
      }
    }

    const hiddenItems = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: productStableIds },
        deletedAt: null,
        visibility: 'HIDDEN',
      },
      select: { stableId: true },
    });
    if (dto.channel === Channel.web && hiddenItems.length > 0) {
      throw new BadRequestException(
        'hidden menu items are not available for customer ordering',
      );
    }

    const couponInfo = await this.membership.validateCouponForOrder({
      userId,
      couponStableId: normalizedCouponStableId ?? undefined,
    });
    const promotionRuleChannel = resolvePromotionRuleChannel(dto.channel);
    const promotionContext = promotionRuleChannel
      ? await this.promotions.getOrderPromotionContext(promotionRuleChannel)
      : undefined;
    const promotionEvaluation = evaluateOrderPromotions({
      lines: promotionLines,
      coupon: couponInfo?.coupon
        ? toCouponPromotionLike(couponInfo.coupon)
        : null,
      promotionContext,
      customer: { isMember: Boolean(userId) },
      posDiscountCents:
        dto.channel === Channel.in_store ? dto.discountCents : undefined,
    });
    assertCouponPromotionAccepted(
      promotionEvaluation,
      couponInfo?.coupon?.couponStableId,
    );

    const posDiscountCents = resolvePromotionDiscountCentsBySource(
      promotionEvaluation,
      'POS_MANUAL_DISCOUNT',
    );
    const couponDiscountCents =
      resolveCouponPromotionDiscountCents(promotionEvaluation);
    const automaticPromotionDiscountCents =
      resolvePromotionDiscountCentsBySource(
        promotionEvaluation,
        'AUTOMATIC_PROMOTION',
      );
    const subtotalAfterCoupon = Math.max(
      0,
      subtotalCents -
        posDiscountCents -
        couponDiscountCents -
        automaticPromotionDiscountCents,
    );

    let loyaltyRedeemCents = 0;
    if (
      loyaltyPolicy &&
      userId &&
      typeof requestedPoints === 'number' &&
      requestedPoints > 0
    ) {
      const availableTender =
        await this.loyalty.getAvailablePaymentTender(userId);
      const maxRedeemableCents =
        await this.loyalty.maxRedeemableCentsFromBalance(
          availableTender.pointsMicro,
        );
      const requestedRedeemCents = resolveRequestedLoyaltyRedeemCents(
        requestedPoints,
        loyaltyPolicy.redeemDollarPerPoint,
      );
      loyaltyRedeemCents = Math.min(
        subtotalAfterCoupon,
        maxRedeemableCents,
        requestedRedeemCents,
      );
    }

    const purchaseBaseCents = Math.max(
      0,
      subtotalAfterCoupon - loyaltyRedeemCents,
    );
    const taxableCents =
      purchaseBaseCents + (isDelivery ? deliveryFeeCustomerCents : 0);
    const taxCents = Math.round(taxableCents * pricingConfig.salesTaxRate);
    const totalCents = purchaseBaseCents + deliveryFeeCustomerCents + taxCents;
    const pricingDisplay = buildOrderPricingDisplay({
      effectiveSubtotalCents: subtotalCents,
      promotionSnapshot: promotionEvaluation.snapshot,
      items: calculatedItems,
      couponTitleSnapshot: couponInfo?.coupon?.title ?? null,
      couponDiscountCents,
      loyaltyRedeemCents,
      subtotalAfterDiscountCents: purchaseBaseCents,
    });

    return {
      subtotalCents,
      displaySubtotalCents: pricingDisplay.displaySubtotalCents,
      couponDiscountCents,
      automaticPromotionDiscountCents,
      posManualDiscountCents: posDiscountCents,
      loyaltyRedeemCents,
      taxCents,
      deliveryFeeCents: deliveryFeeCustomerCents,
      totalCents,
      appliedDiscounts: pricingDisplay.discounts,
    };
  }

  async quoteWebPaymentTender(dto: CreateOrderInput): Promise<{
    pricing: OrderPricingQuote;
    balanceCents: number;
    externalCents: number;
  }> {
    const pricing = await this.quoteOrderPricing(dto);
    const requestedBalanceCents = Math.max(
      0,
      Math.round(dto.balanceUsedCents ?? 0),
    );
    if (requestedBalanceCents === 0) {
      return {
        pricing,
        balanceCents: 0,
        externalCents: pricing.totalCents,
      };
    }

    const userStableId =
      typeof dto.userStableId === 'string' ? dto.userStableId.trim() : '';
    if (!userStableId) {
      throw new BadRequestException(
        'member is required for stored balance payment',
      );
    }
    const userId = await this.loyalty.resolveUserIdByStableId(userStableId);
    const availableTender =
      await this.loyalty.getAvailablePaymentTender(userId);
    if (requestedBalanceCents > availableTender.balanceCents) {
      throw new ConflictException({
        code: 'STORE_BALANCE_CHANGED',
        message:
          'Available stored balance changed. Refresh checkout and try again.',
        availableBalanceCents: availableTender.balanceCents,
      });
    }

    const balanceCents = Math.min(requestedBalanceCents, pricing.totalCents);
    return {
      pricing,
      balanceCents,
      externalCents: Math.max(0, pricing.totalCents - balanceCents),
    };
  }

  async getExternalPaymentCents(orderStableId: string): Promise<number | null> {
    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      select: {
        id: true,
        channel: true,
        totalCents: true,
        paymentBreakdownJson: true,
      },
    });
    if (!order) throw new NotFoundException('order not found');
    return this.resolveExternalPaymentCents(order);
  }

  private async resolveExternalPaymentCents(order: {
    id: string;
    channel: Channel;
    totalCents: number;
    paymentBreakdownJson?: Prisma.JsonValue | null;
  }): Promise<number | null> {
    const breakdown = order.paymentBreakdownJson;
    if (
      breakdown &&
      typeof breakdown === 'object' &&
      !Array.isArray(breakdown)
    ) {
      const externalCents = breakdown.externalCents;
      if (
        typeof externalCents === 'number' &&
        Number.isInteger(externalCents) &&
        externalCents >= 0
      ) {
        return externalCents;
      }
    }

    if (order.channel !== Channel.web) return null;
    if (order.totalCents === 0) return 0;

    // Compatibility for Web orders created before externalCents was persisted.
    // Reconstruct the tender split from financial facts: points are already
    // reflected in totalCents, while committed Store Balance is a payment
    // tender. Anything left after that balance tender is external payment.
    const settledBalanceCents =
      await this.loyalty.getSettledBalancePaymentCentsForOrder(order.id);
    return Math.max(
      0,
      order.totalCents - Math.min(order.totalCents, settledBalanceCents),
    );
  }

  private getTotalDiscountCents(order: {
    subtotalCents?: number | null;
    subtotalAfterDiscountCents?: number | null;
    couponDiscountCents?: number | null;
    loyaltyRedeemCents?: number | null;
  }): number {
    const subtotalCents = order.subtotalCents ?? 0;
    const subtotalAfterDiscountCents = order.subtotalAfterDiscountCents;
    if (
      typeof subtotalAfterDiscountCents === 'number' &&
      Number.isFinite(subtotalAfterDiscountCents)
    ) {
      return Math.max(0, subtotalCents - subtotalAfterDiscountCents);
    }
    return Math.max(
      0,
      (order.couponDiscountCents ?? 0) + (order.loyaltyRedeemCents ?? 0),
    );
  }

  private toOrderDto(order: OrderWithItems | OrderDetail): OrderDto {
    const orderStableId = order.orderStableId;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const deliveryCostCents = order.deliveryCostCents ?? 0;

    if (!orderStableId) {
      // 按你的业务前提 stableId 非空，这里属于数据异常
      throw new BadRequestException('orderStableId missing');
    }

    const orderNumber = order.clientRequestId ?? orderStableId;
    const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
    const deliverySubsidyCents =
      typeof deliverySubsidyCentsRaw === 'number' &&
      Number.isFinite(deliverySubsidyCentsRaw)
        ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
        : Math.max(0, deliveryCostCents - deliveryFeeCents);

    const rawItems: OrderItemSnapshot[] = Array.isArray(order.items)
      ? (order.items as OrderItemSnapshot[])
      : [];
    const items: OrderItemDto[] = rawItems.map((it) => {
      const components = buildOrderItemComponentDisplaySnapshots(
        it.componentsJson,
        it.qty,
        it.optionsJson,
      );
      return {
        productStableId: it.productStableId,
        qty: it.qty,
        displayName:
          it.displayName || it.nameEn || it.nameZh || it.productStableId,
        nameEn: it.nameEn ?? null,
        nameZh: it.nameZh ?? null,
        unitPriceCents: it.unitPriceCents ?? 0,
        specialInstructions: it.externalSpecialInstructions?.trim() || null,
        optionsJson: it.optionsJson ?? undefined,
        componentsJson: it.componentsJson ?? undefined,
        ...(components.length > 0
          ? {
              displayOptions: buildOrderItemParentDisplayOptions(
                it.optionsJson,
                components,
              ),
              components,
            }
          : {}),
      };
    });
    const subtotalCents = order.subtotalCents ?? 0;
    const loyaltyRedeemCents = order.loyaltyRedeemCents ?? 0;
    const subtotalAfterDiscountCents =
      order.subtotalAfterDiscountCents ??
      Math.max(
        0,
        subtotalCents - (order.couponDiscountCents ?? 0) - loyaltyRedeemCents,
      );
    const pricingDisplay = buildOrderPricingDisplay({
      effectiveSubtotalCents: subtotalCents,
      promotionSnapshot: order.promotionSnapshot,
      items: rawItems,
      couponTitleSnapshot: order.couponTitleSnapshot ?? null,
      couponDiscountCents: order.couponDiscountCents ?? 0,
      loyaltyRedeemCents,
      subtotalAfterDiscountCents,
    });
    const creditCardSurchargeCents = Math.max(
      0,
      order.creditCardSurchargeCents ?? 0,
    );
    const paymentTotalCents =
      typeof order.paymentTotalCents === 'number' &&
      Number.isFinite(order.paymentTotalCents) &&
      order.paymentTotalCents > 0
        ? Math.round(order.paymentTotalCents)
        : (order.totalCents ?? 0) + creditCardSurchargeCents;

    return {
      orderStableId,
      orderNumber,
      clientRequestId: order.clientRequestId ?? null,

      status: order.status,
      channel: order.channel,
      fulfillmentType: order.fulfillmentType,

      paymentMethod: order.paymentMethod ?? null,

      pickupCode: order.pickupCode ?? null,
      orderNotes: order.externalOrderNotes?.trim() || null,

      contactName: order.contactName ?? null,
      contactEmail: order.contactEmail ?? null,
      contactPhone: order.contactPhone ?? null,

      deliveryType: order.deliveryType ?? null,
      deliveryProvider: order.deliveryProvider ?? null,
      deliveryEtaMinMinutes: order.deliveryEtaMinMinutes ?? null,
      deliveryEtaMaxMinutes: order.deliveryEtaMaxMinutes ?? null,

      subtotalCents,
      displaySubtotalCents: pricingDisplay.displaySubtotalCents,
      appliedDiscounts: pricingDisplay.discounts,
      subtotalAfterDiscountCents,
      taxCents: order.taxCents ?? 0,
      deliveryFeeCents: order.deliveryFeeCents ?? 0,
      deliveryCostCents,
      deliverySubsidyCents,
      totalCents: order.totalCents ?? 0,
      paymentTotalCents,
      creditCardSurchargeCents,

      couponCodeSnapshot: order.couponCodeSnapshot ?? null,
      couponTitleSnapshot: order.couponTitleSnapshot ?? null,
      couponDiscountCents: order.couponDiscountCents ?? 0,

      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,

      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,

      items,
    };
  }

  private async getLoyaltyUsageByOrderStableId(orderStableId: string): Promise<{
    balancePaidCents: number;
    pointsEarned: number;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      select: { id: true },
    });

    if (!order) {
      return {
        balancePaidCents: 0,
        pointsEarned: 0,
      };
    }

    const ledgers = await this.prisma.loyaltyLedger.findMany({
      where: {
        orderId: order.id,
        OR: [
          { target: 'BALANCE', type: 'REDEEM_ON_ORDER' },
          {
            target: 'POINTS',
            type: { in: ['EARN_ON_PURCHASE', 'AMEND_EARN_ADJUST'] },
          },
        ],
      },
      select: { target: true, deltaMicro: true },
    });

    const balanceMicroUsed = ledgers
      .filter((entry) => entry.target === 'BALANCE' && entry.deltaMicro < 0n)
      .reduce((sum, entry) => sum + -entry.deltaMicro, 0n);
    const pointsEarnedMicro = ledgers
      .filter((entry) => entry.target === 'POINTS')
      .reduce((sum, entry) => sum + entry.deltaMicro, 0n);

    return {
      balancePaidCents: Number(balanceMicroUsed) / 10_000,
      pointsEarned: Number(pointsEarnedMicro) / 1_000_000,
    };
  }
  private isClientRequestId(value: unknown): value is string {
    return typeof value === 'string' && this.CLIENT_REQUEST_ID_RE.test(value);
  }

  private buildClientRequestIdCandidate(now: Date): string {
    return buildClientRequestId(now);
  }

  private async allocateClientRequestIdTx(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    // 预检查 + 少量重试（并发下仍以 DB unique 为最终兜底）
    for (let i = 0; i < 10; i++) {
      const candidate = this.buildClientRequestIdCandidate(now);
      const exists = await tx.order.findUnique({
        where: { clientRequestId: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException('failed to allocate clientRequestId');
  }

  private getUniqueViolationTargets(error: unknown): string[] | null {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
    if (error.code !== 'P2002') return null;
    const meta = error.meta as { target?: unknown } | undefined;
    const target = meta?.target;
    if (Array.isArray(target)) {
      const filtered = target.filter(
        (item): item is string => typeof item === 'string',
      );
      return filtered.length > 0 ? filtered : null;
    }
    return typeof target === 'string' ? [target] : null;
  }

  private isClientRequestIdUniqueViolation(error: unknown): boolean {
    const targets = this.getUniqueViolationTargets(error);
    return targets ? targets.includes('clientRequestId') : false;
  }

  /**
   * ✅ 统一入口：把“外部 orderRef（stableId / legacy clientRequestId / uuid / checkoutIntent ref）”
   * resolve 成数据库内部 UUID（order.id）
   *
   * 说明：
   * - 对外stableId
   */
  private isUuid(value: string | null | undefined): boolean {
    return (
      typeof value === 'string' &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        value,
      )
    );
  }

  private trustedStoreOrderWhere(
    storeStableId: string,
  ): Prisma.OrderWhereInput {
    const normalizedStoreStableId = storeStableId.trim();
    if (!normalizedStoreStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    return {
      storeId: normalizedStoreStableId,
    };
  }

  private async resolveInternalOrderIdByStableIdForStoreOrThrow(
    orderStableId: string,
    storeStableId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    id: string;
    orderStableId: string;
    clientRequestId: string | null;
  }> {
    const value = (orderStableId ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    if (value.includes('-')) throw new BadRequestException('stableId only');

    const found = await client.order.findFirst({
      where: {
        orderStableId: value,
        ...this.trustedStoreOrderWhere(storeStableId),
      },
      select: { id: true, orderStableId: true, clientRequestId: true },
    });
    if (!found) throw new NotFoundException('order not found');
    return found;
  }

  // ✅ public/controller：只接受 stableId（cuid v1），不再接受 UUID
  private async resolveInternalOrderIdByStableIdOrThrow(
    orderStableId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    id: string;
    orderStableId: string;
    clientRequestId: string | null;
  }> {
    const value = (orderStableId ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    if (value.includes('-')) throw new BadRequestException('stableId only');

    const found = await client.order.findUnique({
      where: { orderStableId: value },
      select: { id: true, orderStableId: true, clientRequestId: true },
    });
    if (!found) throw new NotFoundException('order not found');
    return found;
  }

  // ✅ 第三方 webhook/internal：如你确实需要用 Uber 回调的 orderId 来反查
  //    这里不允许 UUID，只允许 clientRequestId 或 orderStableId（二者都不含 '-'）
  private async resolveInternalOrderIdByExternalRefOrThrow(
    externalRef: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    id: string;
    orderStableId: string;
    clientRequestId: string | null;
  }> {
    const value = (externalRef ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    if (value.includes('-')) throw new BadRequestException('stableId only');

    const found = await client.order.findFirst({
      where: {
        OR: [{ clientRequestId: value }, { orderStableId: value }],
      },
      select: { id: true, orderStableId: true, clientRequestId: true },
    });

    if (!found) throw new NotFoundException('order not found');
    return found;
  }

  private async resolveInternalOrderIdOrThrow(
    orderId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    id: string;
    orderStableId: string;
    clientRequestId: string | null;
  }> {
    const value = (orderId ?? '').trim();
    if (!value) throw new NotFoundException('order not found');

    if (value.includes('-')) {
      if (!this.isUuid(value)) {
        throw new BadRequestException('invalid order id');
      }
      const found = await client.order.findUnique({
        where: { id: value },
        select: { id: true, orderStableId: true, clientRequestId: true },
      });
      if (!found) throw new NotFoundException('order not found');
      return found;
    }

    const found = await client.order.findFirst({
      where: {
        OR: [{ clientRequestId: value }, { orderStableId: value }],
      },
      select: { id: true, orderStableId: true, clientRequestId: true },
    });

    if (!found) throw new NotFoundException('order not found');
    return found;
  }

  private async updateStatusByInternalId(
    id: string,
    next: OrderStatus,
  ): Promise<OrderWithItems> {
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: {
        status: true,
        paidAt: true,
        makingAt: true,
        fulfillmentType: true,
      },
    });
    if (!current) throw new NotFoundException('order not found');

    if (!ORDER_STATUS_TRANSITIONS[current.status].includes(next)) {
      throw new BadRequestException(
        `illegal transition ${current.status} -> ${next}`,
      );
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status: next };
    if (next === 'making' && !current.makingAt) {
      data.makingAt = new Date();
    }
    if (next === 'ready') {
      data.readyAt = new Date();
      if (!current.makingAt) {
        data.makingAt = current.paidAt;
      }
    }

    const result = await this.prisma.order.updateMany({
      where: { id, status: current.status },
      data,
    });

    const updated = (await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })) as (OrderWithItems & { loyaltyRedeemCents: number }) | null;

    if (!updated) throw new NotFoundException('order not found');

    if (result.count === 0) {
      return updated;
    }

    // —— 积分结算与优惠券处理
    if (next === 'paid') {
      // [优化]：使用公共方法，逻辑统一
      void this.handleOrderPaidSideEffects(updated);
    } else if (next === 'refunded') {
      void this.loyalty.rollbackOnRefund(updated.id);
    } else if (next === 'ready') {
      this.notifyOrderReady(updated)
        .then((notificationResult) => {
          this.logOrderReadyNotificationResult(updated, notificationResult);
        })
        .catch((error: unknown) => {
          this.logOrderReadyNotificationResult(updated, {
            ok: false,
            finalChannel: null,
            attemptedChannels: [],
            reason: this.sanitizeNotificationFailure(error),
          });
        });
    } else if (next === 'making' && updated.orderStableId) {
      this.logger.log(`Event Emitted: order.accepted -> ${updated.id}`);
      this.orderEventsBus.emitOrderAccepted({
        orderId: updated.id,
        stableId: updated.orderStableId,
      });
    }
    return updated;
  }

  async getAveragePrepTimeMinutes(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['ready', 'completed'] },
        readyAt: { gte: oneHourAgo },
        makingAt: { not: null },
      },
      select: {
        makingAt: true,
        readyAt: true,
      },
    });

    if (recentOrders.length === 0) return 15;

    const totalMinutes = recentOrders.reduce((acc, order) => {
      const makingAt = order.makingAt;
      const readyAt = order.readyAt;
      if (!makingAt || !readyAt) return acc;
      const diffMs = readyAt.getTime() - makingAt.getTime();
      return acc + diffMs / 60000;
    }, 0);

    const avg = Math.round(totalMinutes / recentOrders.length);
    return Math.max(avg, 5);
  }

  private logOrderReadyNotificationResult(
    order: Pick<OrderWithItems, 'id' | 'orderStableId'>,
    result: OrderReadyNotificationResult,
  ): void {
    const failureReason =
      result.reason ?? result.error ?? result.fallbackReason;
    const fields = {
      event: 'order_ready_notification_completed',
      orderId: order.id,
      orderStableId: order.orderStableId ?? null,
      finalChannel: result.finalChannel,
      attemptedChannels: [...result.attemptedChannels],
      ok: result.ok,
      ...(failureReason
        ? {
            failureReason: this.sanitizeNotificationFailure(failureReason),
          }
        : {}),
    };

    if (result.ok) this.logger.log(fields);
    else this.logger.warn(fields);
  }

  private sanitizeNotificationFailure(reason: unknown): string {
    const raw =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'notification_failed';

    return raw
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]')
      .replace(/\s+/g, ' ')
      .slice(0, 200);
  }

  private async notifyOrderReady(
    order: OrderWithItems,
  ): Promise<OrderReadyNotificationResult> {
    if (order.fulfillmentType === FulfillmentType.delivery) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'delivery_order',
      };
    }

    const orderNumber = order.clientRequestId ?? order.orderStableId;
    if (!orderNumber) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'missing_order_number',
      };
    }

    const locale = await this.resolveOrderReadyLocale(order);
    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });
    const metadata = this.asRecord(checkoutIntent?.metadataJson);
    const verifiedContacts = this.asRecord(metadata?.verifiedContacts);
    const verifiedEmail = normalizeEmail(
      typeof verifiedContacts?.email === 'string'
        ? verifiedContacts.email
        : null,
    );
    const verifiedPhone =
      typeof verifiedContacts?.phone === 'string'
        ? verifiedContacts.phone.trim() || null
        : null;

    const member = order.userId
      ? await this.prisma.user.findUnique({
          where: { id: order.userId },
          select: {
            email: true,
            emailVerifiedAt: true,
            phone: true,
            phoneVerifiedAt: true,
          },
        })
      : null;
    const memberEmail = member?.emailVerifiedAt
      ? normalizeEmail(member.email)
      : null;
    const memberPhone = member?.phoneVerifiedAt
      ? member.phone?.trim() || null
      : null;

    const allowExternalContacts = order.channel === Channel.ubereats;
    const email =
      verifiedEmail ??
      memberEmail ??
      (allowExternalContacts ? normalizeEmail(order.contactEmail) : null);
    const phone =
      verifiedPhone ??
      memberPhone ??
      (allowExternalContacts ? order.contactPhone?.trim() || null : null);

    if (!email && !phone) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'no_trusted_contact',
      };
    }

    return this.notificationService.notifyOrderReady({
      email,
      phone,
      orderNumber,
      name: order.contactName ?? null,
      locale,
      userId: order.userId ?? null,
    });
  }

  private async resolveOrderReadyLocale(
    order: Pick<OrderWithItems, 'id' | 'userId'>,
  ): Promise<'zh' | 'en'> {
    if (order.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { language: true },
      });

      if (user?.language === 'ZH') {
        return 'zh';
      }

      if (user?.language === 'EN') {
        return 'en';
      }
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: {
        orderId: order.id,
        locale: { not: null },
      },
      select: { locale: true },
      orderBy: { createdAt: 'desc' },
    });

    if (checkoutIntent?.locale?.toLowerCase().startsWith('zh')) {
      return 'zh';
    }

    return 'en';
  }

  private async handleOrderPaidSideEffects(order: OrderWithItems) {
    // 1. 积分按折后商品消费额计算；积分抵扣本身在 Loyalty 结算时再扣除。
    const netSubtotalForRewards = Math.max(
      0,
      typeof order.subtotalAfterDiscountCents === 'number'
        ? order.subtotalAfterDiscountCents + (order.loyaltyRedeemCents ?? 0)
        : (order.subtotalCents ?? 0) - (order.couponDiscountCents ?? 0),
    );

    // 2. 标记优惠券为已使用 (如果使用了优惠券)
    if (order.couponId) {
      // 使用 void 不阻塞主流程，但建议根据业务决定是否需要 await
      void this.membership.markCouponUsedForOrder({
        couponId: order.couponId,
        orderId: order.id,
      });
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    const pickupTime = this.computePickupTimeFromCheckoutMetadata({
      acceptedAt: order.paidAt,
      metadata: checkoutIntent?.metadataJson,
    });

    this.orderEventsBus.emitOrderPaidVerified({
      orderId: order.id,
      userId: order.userId ?? undefined,
      amountCents: netSubtotalForRewards,
      redeemValueCents: order.loyaltyRedeemCents ?? 0,
      pickupTime,
    });

    this.logger.log(`Emitted order.paid.verified for order ${order.id}`);
  }

  private computePickupTimeFromCheckoutMetadata(params: {
    acceptedAt: Date;
    metadata: unknown;
  }): string | undefined {
    const prepMinutes = this.extractPrepMinutes(params.metadata);
    if (typeof prepMinutes !== 'number' || prepMinutes <= 0) {
      return undefined;
    }

    const pickupAt = new Date(
      params.acceptedAt.getTime() + prepMinutes * 60_000,
    );
    if (Number.isNaN(pickupAt.getTime())) {
      return undefined;
    }

    return pickupAt.toISOString();
  }

  private extractPrepMinutes(metadata: unknown): number | undefined {
    const root = this.asRecord(metadata);
    const estimate = this.asRecord(root?.estimated);

    return this.normalizeMinutes(
      this.asNumber(root?.prepMinutes) ??
        this.asNumber(root?.estimatedPrepMinutes) ??
        this.asNumber(root?.prepareMinutes) ??
        this.asNumber(root?.estimatedReadyMinutes) ??
        this.asNumber(estimate?.prepMinutes) ??
        this.asNumber(estimate?.estimatedPrepMinutes),
    );
  }

  private normalizeMinutes(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    if (value <= 0) return undefined;
    return Math.max(1, Math.round(value));
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * ✅ 统一推断订单 paymentMethod
   * - POS：建议必传；没传就降级为 CASH 并打 warn（避免静默错账）
   * - Web/Clover：默认 CARD
   * - UberEats：平台结算通常可归类为 CARD
   */
  private resolvePaymentMethod(dto: CreateOrderInput): PaymentMethod {
    if (dto.paymentMethod) return dto.paymentMethod;

    if (dto.channel === Channel.web) return PaymentMethod.CARD;
    if (dto.channel === Channel.ubereats) return PaymentMethod.UBEREATS;

    // Channel.in_store 但没传：兜底现金，同时留日志方便你排查 POS 漏传
    this.logger.warn(
      'paymentMethod missing for in_store order; defaulting to CASH. Please send dto.paymentMethod from POS.',
    );
    return PaymentMethod.CASH;
  }

  private async getStorePricingConfig(): Promise<DeliveryPricingConfig> {
    const existing =
      await this.brandStoreConfigReader.getConfiguredStoreSnapshot();

    const deliveryBaseFeeCents = Number.isFinite(existing.deliveryBaseFeeCents)
      ? Math.max(0, Math.round(existing.deliveryBaseFeeCents))
      : DEFAULT_DELIVERY_BASE_FEE_CENTS;
    const priorityPerKmCents = Number.isFinite(existing.priorityPerKmCents)
      ? Math.max(0, Math.round(existing.priorityPerKmCents))
      : DEFAULT_PRIORITY_PER_KM_CENTS;
    const salesTaxRate =
      typeof existing.salesTaxRate === 'number' &&
      Number.isFinite(existing.salesTaxRate) &&
      existing.salesTaxRate >= 0
        ? existing.salesTaxRate
        : DEFAULT_TAX_RATE;
    const maxDeliveryRangeKm =
      typeof existing.maxDeliveryRangeKm === 'number' &&
      Number.isFinite(existing.maxDeliveryRangeKm) &&
      existing.maxDeliveryRangeKm > 0
        ? existing.maxDeliveryRangeKm
        : DEFAULT_MAX_RANGE_KM;
    const priorityDefaultDistanceKm =
      typeof existing.priorityDefaultDistanceKm === 'number' &&
      Number.isFinite(existing.priorityDefaultDistanceKm) &&
      existing.priorityDefaultDistanceKm >= 0
        ? existing.priorityDefaultDistanceKm
        : DEFAULT_PRIORITY_DISTANCE_KM;
    const storeLatitude = Number.isFinite(existing.latitude ?? NaN)
      ? (existing.latitude as number)
      : null;
    const storeLongitude = Number.isFinite(existing.longitude ?? NaN)
      ? (existing.longitude as number)
      : null;
    const enableUberDirect =
      typeof existing.enableUberDirect === 'boolean'
        ? existing.enableUberDirect
        : true;

    return {
      deliveryBaseFeeCents,
      priorityPerKmCents,
      salesTaxRate,
      maxDeliveryRangeKm,
      priorityDefaultDistanceKm,
      storeLatitude,
      storeLongitude,
      enableUberDirect,
    };
  }

  private buildDeliveryFallback(
    pricingConfig: DeliveryPricingConfig,
  ): Record<
    DeliveryType,
    { provider: DeliveryProvider; feeCents: number; etaRange: [number, number] }
  > {
    return {
      [DeliveryType.STANDARD]: {
        provider: DeliveryProvider.UBER,
        feeCents: pricingConfig.deliveryBaseFeeCents,
        etaRange: [35, 50],
      },
      [DeliveryType.PRIORITY]: {
        provider: DeliveryProvider.UBER,
        feeCents:
          pricingConfig.deliveryBaseFeeCents +
          Math.ceil(pricingConfig.priorityDefaultDistanceKm) *
            pricingConfig.priorityPerKmCents,
        etaRange: [25, 35],
      },
    };
  }

  private async resolveTrustedDeliveryDestination(
    dto: CreateOrderInput,
    userId?: string,
  ): Promise<DeliveryDestinationInput | undefined> {
    const dest = dto.deliveryDestination;
    if (!dest) return undefined;

    const phone = await this.resolveDeliveryPhone({
      submittedPhone: dest.phone,
      userId,
      requirePhone: dto.channel !== Channel.ubereats,
    });

    const addressStableId =
      typeof dest.addressStableId === 'string'
        ? normalizeStableId(dest.addressStableId)
        : null;

    if (addressStableId && userId) {
      const saved = await this.prisma.userAddress.findFirst({
        where: {
          userId,
          addressStableId,
        },
        select: {
          addressLine1: true,
          addressLine2: true,
          city: true,
          province: true,
          postalCode: true,
          placeId: true,
          latitude: true,
          longitude: true,
        },
      });

      if (!saved) {
        throw new BadRequestException('selected address does not exist');
      }

      const merged: DeliveryDestinationInput = {
        ...dest,
        ...(phone ? { phone } : {}),
        addressStableId,
        addressLine1: saved.addressLine1,
        ...(saved.addressLine2 ? { addressLine2: saved.addressLine2 } : {}),
        city: saved.city,
        province: saved.province,
        postalCode: saved.postalCode,
        ...(saved.placeId ? { placeId: saved.placeId } : {}),
      };

      if (
        typeof saved.latitude === 'number' &&
        typeof saved.longitude === 'number'
      ) {
        merged.latitude = saved.latitude;
        merged.longitude = saved.longitude;
      } else {
        delete merged.latitude;
        delete merged.longitude;
      }

      return merged;
    }

    const sanitized: DeliveryDestinationInput = {
      ...dest,
      ...(phone ? { phone } : {}),
    };

    delete sanitized.latitude;
    delete sanitized.longitude;

    return sanitized;
  }

  private async resolveDeliveryPhone(params: {
    submittedPhone?: string | null;
    userId?: string;
    requirePhone: boolean;
  }): Promise<string | undefined> {
    const submitted = params.submittedPhone?.trim();
    if (submitted) {
      const normalized = this.normalizeCanadianDeliveryPhone(submitted);
      if (!normalized) {
        throw new BadRequestException({
          code: 'DELIVERY_PHONE_INVALID',
          message: 'Delivery phone must be a valid Canadian phone number',
        });
      }
      return normalized;
    }

    if (params.userId) {
      const member = await this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { phone: true, phoneVerifiedAt: true },
      });
      if (member?.phone && member.phoneVerifiedAt) {
        const normalized = this.normalizeCanadianDeliveryPhone(member.phone);
        if (normalized) return normalized;
      }
    }

    if (params.requirePhone) {
      throw new BadRequestException({
        code: 'DELIVERY_PHONE_REQUIRED',
        message: 'A mobile phone number is required for delivery',
      });
    }

    return undefined;
  }

  private normalizeCanadianDeliveryPhone(phone: string): string | null {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const digits = normalized.replace(/\D/g, '');
    const national =
      digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return national.length === 10 ? `+1${national}` : null;
  }

  // --- 核心逻辑 1: 距离计算 (Haversine Formula) ---
  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // 地球半径 (km)
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return distanceKm;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // --- 核心逻辑 2: 动态运费公式 & 距离验证 ---
  private calculateDynamicDeliveryFee(
    type: DeliveryType,
    distanceKm: number,
    pricingConfig: DeliveryPricingConfig,
  ): number {
    // 1. 🛑 后端强制复验距离限制 (10km)
    const maxRangeKm = pricingConfig.maxDeliveryRangeKm;

    if (distanceKm > maxRangeKm) {
      this.logger.warn(
        `Order rejected: distance ${distanceKm.toFixed(
          2,
        )}km exceeds limit of ${maxRangeKm}km.`,
      );
      throw new BadRequestException(
        `Delivery is not available for this address (exceeds ${maxRangeKm}km limit).`,
      );
    }

    // 2. Standard: 固定 $6 (600 cents)
    if (type === DeliveryType.STANDARD) {
      return pricingConfig.deliveryBaseFeeCents;
    }

    // 3. Priority: 基础费 + 每公里费 (向上取整)
    const baseCents = pricingConfig.deliveryBaseFeeCents;
    const perKmCents = pricingConfig.priorityPerKmCents;

    const chargedKm = Math.ceil(distanceKm);
    const feeCents = baseCents + chargedKm * perKmCents;

    return feeCents;
  }

  private derivePickupCode(source?: string | null): string | undefined {
    if (!source) return undefined;
    const digits = source.replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    if (digits.length > 0) return digits.padStart(4, '0');
    return undefined;
  }

  private collectOptionSelectionRefs(
    options?: Record<string, unknown>,
  ): Array<{ optionId: string; groupKey?: string; sequence: number }> {
    if (!options || typeof options !== 'object') return [];

    const refs: Array<{
      optionId: string;
      groupKey?: string;
      sequence: number;
    }> = [];
    const seen = new Set<string>();
    let sequence = 0;

    const pushOptionId = (value: unknown, groupKey?: string) => {
      let optionId: string | null = null;

      if (typeof value === 'string') {
        optionId = value.trim();
      } else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const byId = record.id;
        const byStableId = record.optionStableId;
        if (typeof byId === 'string' && byId.trim()) {
          optionId = byId.trim();
        } else if (typeof byStableId === 'string' && byStableId.trim()) {
          optionId = byStableId.trim();
        }
      }

      if (!optionId) return;
      const selectionKey = `${groupKey ?? ''}::${optionId}`;
      if (seen.has(selectionKey)) return;
      seen.add(selectionKey);
      refs.push({ optionId, groupKey, sequence: sequence++ });
    };

    Object.entries(options).forEach(([groupKey, val]) => {
      if (groupKey === 'notes') return;
      if (Array.isArray(val)) {
        val.forEach((entry) => pushOptionId(entry, groupKey));
        return;
      }
      pushOptionId(val, groupKey);
    });

    return refs;
  }

  private async ensureLoyaltyAccountWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    return tx.loyaltyAccount.upsert({
      where: { userId },
      create: {
        userId,
        pointsMicro: 0n,
        tier: 'BRONZE',
        lifetimeSpendCents: 0,
      },
      update: {},
      select: {
        id: true,
        userId: true,
        pointsMicro: true,
        tier: true,
        lifetimeSpendCents: true,
      },
    });
  }

  /**
   * 🛡️ 安全核心：服务端重算商品价格
   */
  private async calculateLineItems(
    itemsDto: OrderItemInput[],
    options?: { allowCustomUnitPrice?: boolean },
  ): Promise<{
    calculatedItems: Prisma.OrderItemCreateWithoutOrderInput[];
    calculatedSubtotal: number;
    promotionLines: PromotionOrderLine[];
  }> {
    const normalizedItems = itemsDto.map((item) => {
      const normalizedId = normalizeStableId(
        item.productId ?? item.productStableId,
      );
      if (!normalizedId) {
        throw new BadRequestException('Product id is required');
      }
      return {
        ...item,
        normalizedProductId: normalizedId,
      };
    });

    const allowCustomUnitPrice = options?.allowCustomUnitPrice === true;
    const productIds = normalizedItems.map((i) => i.normalizedProductId);
    const allChoiceIds: string[] = [];

    for (const item of normalizedItems) {
      if (item.options && typeof item.options === 'object') {
        Object.values(item.options).forEach((val) => {
          if (typeof val === 'string') allChoiceIds.push(val);
          else if (Array.isArray(val)) {
            val.forEach((v) => {
              if (typeof v === 'string') allChoiceIds.push(v);
            });
          }
        });
      }
    }

    const dbProducts = await this.prisma.menuItem.findMany({
      where: {
        OR: [{ id: { in: productIds } }, { stableId: { in: productIds } }],
      },
      include: {
        fixedComponents: {
          orderBy: { sortOrder: 'asc' },
        },
        optionGroups: {
          where: { isEnabled: true },
          include: {
            templateGroup: {
              include: {
                options: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        },
      },
    });

    const productMap = new Map<string, MenuItemWithOptions>();
    const choiceLookupByProductId = new Map<
      string,
      Map<string, OptionChoiceContext>
    >();
    const itemAvailabilityByStableId = new Map<string, boolean>();

    const setItemAvailability = (
      stableId: string,
      isAvailable: boolean,
      tempUnavailableUntil: Date | null,
    ) => {
      itemAvailabilityByStableId.set(
        stableId,
        isAvailableNow(availabilityFromDb(isAvailable, tempUnavailableUntil)),
      );
    };

    const addProductOptionChoices = (
      optionLookup: Map<string, OptionChoiceContext>,
      product: MenuItemWithOptions,
    ) => {
      for (const link of product.optionGroups ?? []) {
        if (!link.isEnabled || !link.templateGroup) continue;
        const templateGroup = link.templateGroup;
        if ((templateGroup as { deletedAt?: Date | null }).deletedAt) continue;

        const choices = (templateGroup.options ?? []).filter((opt) => {
          const deleted = (opt as { deletedAt?: Date | null }).deletedAt;
          if (deleted) return false;

          const selfAvailable = isAvailableNow(
            availabilityFromDb(opt.isAvailable, opt.tempUnavailableUntil),
          );
          if (!selfAvailable) return false;

          const targetItemStableId = opt.targetItemStableId?.trim();
          if (!targetItemStableId) return true;

          return itemAvailabilityByStableId.get(targetItemStableId) !== false;
        });

        choices.forEach((choice) => {
          optionLookup.set(choice.id, { choice, group: templateGroup, link });
          optionLookup.set(choice.stableId, {
            choice,
            group: templateGroup,
            link,
          });
        });
      }
    };

    for (const product of dbProducts) {
      productMap.set(product.id, product);
      productMap.set(product.stableId, product);
      setItemAvailability(
        product.stableId,
        product.isAvailable,
        product.tempUnavailableUntil,
      );

      const optionLookup = new Map<string, OptionChoiceContext>();
      addProductOptionChoices(optionLookup, product);

      choiceLookupByProductId.set(product.id, optionLookup);
      choiceLookupByProductId.set(product.stableId, optionLookup);
    }

    const linkedProductByStableId = new Map<
      string,
      MenuItemWithOptions | null
    >();
    const ensureLinkedProductByStableId = async (
      stableId: string,
    ): Promise<MenuItemWithOptions | null> => {
      if (linkedProductByStableId.has(stableId)) {
        return linkedProductByStableId.get(stableId) ?? null;
      }

      const linkedProduct = await this.prisma.menuItem.findFirst({
        where: {
          stableId,
          deletedAt: null,
        },
        include: {
          fixedComponents: {
            orderBy: { sortOrder: 'asc' },
          },
          optionGroups: {
            where: { isEnabled: true },
            include: {
              templateGroup: {
                include: {
                  options: {
                    where: { deletedAt: null },
                  },
                },
              },
            },
          },
        },
      });

      linkedProductByStableId.set(stableId, linkedProduct);
      if (linkedProduct) {
        setItemAvailability(
          linkedProduct.stableId,
          linkedProduct.isAvailable,
          linkedProduct.tempUnavailableUntil,
        );
      }
      return linkedProduct;
    };

    const prepareFixedComponentTree = async (
      product: MenuItemWithOptions,
      optionLookup: Map<string, OptionChoiceContext>,
      visiting = new Set<string>(),
    ): Promise<void> => {
      if (visiting.has(product.stableId)) {
        throw new BadRequestException(
          `Fixed combo component cycle detected at ${product.stableId}`,
        );
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(product.stableId);

      for (const component of product.fixedComponents ?? []) {
        const linkedProduct = await ensureLinkedProductByStableId(
          component.componentItemStableId,
        );
        if (!linkedProduct) {
          throw new BadRequestException(
            `Fixed component item not found: ${component.componentItemStableId}`,
          );
        }
        if (
          !isAvailableNow(
            availabilityFromDb(
              linkedProduct.isAvailable,
              linkedProduct.tempUnavailableUntil,
            ),
          )
        ) {
          throw new BadRequestException(
            `Fixed component item not available: ${component.componentItemStableId}`,
          );
        }
        addProductOptionChoices(optionLookup, linkedProduct);
        await prepareFixedComponentTree(
          linkedProduct,
          optionLookup,
          nextVisiting,
        );
      }
    };

    const { specials: activeDailySpecials } =
      await this.dailySpecialOffers.getActiveDailySpecials(
        dbProducts.map((product) => ({
          itemStableId: product.stableId,
          basePriceCents: product.basePriceCents,
        })),
      );
    const activeSpecialsByItemStableId = new Map<
      string,
      (typeof activeDailySpecials)[number]
    >();
    activeDailySpecials.forEach((special) => {
      if (!activeSpecialsByItemStableId.has(special.itemStableId)) {
        activeSpecialsByItemStableId.set(special.itemStableId, special);
      }
    });

    let calculatedSubtotal = 0;
    const calculatedItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    const promotionLines: PromotionOrderLine[] = [];

    for (const itemDto of normalizedItems) {
      const product = productMap.get(itemDto.normalizedProductId);
      if (!product) {
        throw new BadRequestException(
          `Product not found or unavailable: ${itemDto.normalizedProductId}`,
        );
      }
      const productAvailability = availabilityFromDb(
        product.isAvailable,
        product.tempUnavailableUntil,
      );
      if (!isAvailableNow(productAvailability)) {
        throw new BadRequestException(
          `Product not available: ${itemDto.normalizedProductId}`,
        );
      }

      const selectedOptionRefs = this.collectOptionSelectionRefs(
        itemDto.options,
      );
      const selectedOptionIds = selectedOptionRefs.map((it) => it.optionId);

      const baseOptionLookup =
        choiceLookupByProductId.get(itemDto.normalizedProductId) ??
        new Map<string, OptionChoiceContext>();
      const optionLookup = new Map(baseOptionLookup);
      await prepareFixedComponentTree(product, optionLookup);

      const processedSelectedOptionIds = new Set<string>();
      const expandedTargetItems = new Set<string>();
      const pendingSelectedOptionIds = [...selectedOptionIds];

      while (pendingSelectedOptionIds.length > 0) {
        const optionId = pendingSelectedOptionIds.pop();
        if (!optionId || processedSelectedOptionIds.has(optionId)) continue;
        processedSelectedOptionIds.add(optionId);

        const context = optionLookup.get(optionId);
        if (!context) continue;

        const targetItemStableId = context.choice.targetItemStableId?.trim();
        if (
          !targetItemStableId ||
          expandedTargetItems.has(targetItemStableId)
        ) {
          continue;
        }

        expandedTargetItems.add(targetItemStableId);
        const linkedProduct =
          await ensureLinkedProductByStableId(targetItemStableId);
        if (!linkedProduct) continue;

        addProductOptionChoices(optionLookup, linkedProduct);

        selectedOptionIds.forEach((selectedId) => {
          if (!processedSelectedOptionIds.has(selectedId)) {
            pendingSelectedOptionIds.push(selectedId);
          }
        });
      }

      const activeSpecial =
        activeSpecialsByItemStableId.get(product.stableId) ?? null;
      const baseUnitPriceCents =
        activeSpecial?.effectivePriceCents ?? product.basePriceCents;
      let optionsUnitPriceCents = 0;

      const optionGroupSnapshots = new Map<
        string,
        OrderItemOptionGroupSnapshot & { sequence: number }
      >();

      for (const selectedRef of selectedOptionRefs) {
        const optionId = selectedRef.optionId;
        const context = optionLookup.get(optionId);
        if (!context) {
          throw new BadRequestException(
            `Option not found or unavailable: ${optionId} for product ${itemDto.normalizedProductId}`,
          );
        }

        const targetItemStableId = context.choice.targetItemStableId?.trim();
        if (targetItemStableId) {
          const cachedTargetAvailability =
            itemAvailabilityByStableId.get(targetItemStableId);
          if (cachedTargetAvailability === false) {
            throw new BadRequestException(
              `Option not available because target item is unavailable: ${optionId}`,
            );
          }
          if (cachedTargetAvailability === undefined) {
            const linkedTarget =
              await ensureLinkedProductByStableId(targetItemStableId);
            const isTargetAvailable =
              !!linkedTarget &&
              isAvailableNow(
                availabilityFromDb(
                  linkedTarget.isAvailable,
                  linkedTarget.tempUnavailableUntil,
                ),
              );
            if (!isTargetAvailable) {
              throw new BadRequestException(
                `Option not available because target item is unavailable: ${optionId}`,
              );
            }
          }
        }

        optionsUnitPriceCents += context.choice.priceDeltaCents;
        const templateGroupStableId = context.group.stableId;
        const snapshotKey = selectedRef.groupKey
          ? `${templateGroupStableId}::${selectedRef.groupKey}`
          : templateGroupStableId;

        const groupSnapshot =
          optionGroupSnapshots.get(snapshotKey) ??
          ({
            templateGroupStableId,
            groupKey: selectedRef.groupKey ?? null,
            nameEn: context.group.nameEn,
            nameZh: context.group.nameZh ?? null,
            minSelect:
              typeof context.link?.minSelect === 'number'
                ? context.link.minSelect
                : context.group.defaultMinSelect,
            maxSelect:
              context.link?.maxSelect ?? context.group.defaultMaxSelect ?? null,
            sortOrder:
              typeof context.link?.sortOrder === 'number'
                ? context.link.sortOrder
                : (context.group.sortOrder ?? 0),
            sequence: selectedRef.sequence,
            choices: [] as OrderItemOptionChoiceSnapshot[],
          } satisfies OrderItemOptionGroupSnapshot & { sequence: number });

        groupSnapshot.choices.push({
          stableId: context.choice.stableId,
          templateGroupStableId,
          targetItemStableId: context.choice.targetItemStableId?.trim() || null,
          nameEn: context.choice.nameEn,
          nameZh: context.choice.nameZh ?? null,
          priceDeltaCents: context.choice.priceDeltaCents,
          sortOrder:
            typeof selectedRef?.sequence === 'number'
              ? selectedRef.sequence
              : (context.choice.sortOrder ?? 0),
        });

        optionGroupSnapshots.set(snapshotKey, groupSnapshot);
      }

      const optionsSnapshot: OrderItemOptionsSnapshot = Array.from(
        optionGroupSnapshots.values(),
      )
        .map((group) => ({
          ...group,
          choices: [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder),
        }))
        .sort((a, b) => {
          if (a.sequence !== b.sequence) return a.sequence - b.sequence;
          return a.sortOrder - b.sortOrder;
        })
        .map((group) => {
          const { sequence, ...rest } = group;
          void sequence;
          return rest;
        });

      const componentSnapshots: OrderItemComponentsSnapshot = [];
      const componentPathQuantity = new Map<string, number>();
      const optionGroupsUnderPath = (
        pathKey: string,
      ): OrderItemOptionsSnapshot =>
        optionsSnapshot.filter((group) =>
          group.groupKey?.startsWith(`${pathKey}__`),
        );

      const appendFixedComponentSnapshots = async (
        parent: MenuItemWithOptions,
        basePathKey: string,
        parentQuantity: number,
        visiting = new Set<string>(),
      ): Promise<void> => {
        if (visiting.has(parent.stableId)) return;
        const nextVisiting = new Set(visiting);
        nextVisiting.add(parent.stableId);

        for (const component of parent.fixedComponents ?? []) {
          const linkedProduct = await ensureLinkedProductByStableId(
            component.componentItemStableId,
          );
          if (!linkedProduct) continue;
          const quantityPerParent =
            parentQuantity * Math.max(1, Math.trunc(component.quantity));
          const componentPathKey = `${basePathKey}__component-${component.componentItemStableId}`;
          componentPathQuantity.set(componentPathKey, quantityPerParent);

          if ((linkedProduct.fixedComponents ?? []).length > 0) {
            await appendFixedComponentSnapshots(
              linkedProduct,
              componentPathKey,
              quantityPerParent,
              nextVisiting,
            );
            continue;
          }

          componentSnapshots.push({
            productStableId: linkedProduct.stableId,
            nameEn: linkedProduct.nameEn,
            nameZh: linkedProduct.nameZh ?? null,
            quantityPerParent,
            source: 'FIXED',
            options: optionGroupsUnderPath(componentPathKey),
          });
        }
      };

      await appendFixedComponentSnapshots(
        product,
        `root__${product.stableId}`,
        1,
      );

      const quantityForGroupPath = (groupKey: string | null | undefined) => {
        if (!groupKey) return 1;
        let multiplier = 1;
        let matchedLength = -1;
        for (const [pathKey, quantity] of componentPathQuantity) {
          if (
            (groupKey === pathKey || groupKey.startsWith(`${pathKey}__`)) &&
            pathKey.length > matchedLength
          ) {
            multiplier = quantity;
            matchedLength = pathKey.length;
          }
        }
        return multiplier;
      };

      for (const group of optionsSnapshot) {
        for (const choice of group.choices) {
          const targetItemStableId = choice.targetItemStableId?.trim();
          if (!targetItemStableId) continue;
          const linkedProduct =
            await ensureLinkedProductByStableId(targetItemStableId);
          const targetPathKey = group.groupKey
            ? `${group.groupKey}__option-${choice.stableId}`
            : null;
          const optionComponent: OrderItemComponentSnapshot = {
            productStableId: targetItemStableId,
            nameEn: linkedProduct?.nameEn ?? choice.nameEn,
            nameZh: linkedProduct?.nameZh ?? choice.nameZh ?? null,
            quantityPerParent: quantityForGroupPath(group.groupKey),
            source: 'OPTION',
            sourceOptionStableId: choice.stableId,
            options: targetPathKey ? optionGroupsUnderPath(targetPathKey) : [],
          };
          componentSnapshots.push(optionComponent);
        }
      }

      const submittedCustomUnitPriceCents =
        allowCustomUnitPrice &&
        typeof itemDto.unitPrice === 'number' &&
        Number.isFinite(itemDto.unitPrice) &&
        itemDto.unitPrice >= 0
          ? Math.round(itemDto.unitPrice * 100)
          : null;
      const unitPriceCents =
        submittedCustomUnitPriceCents ??
        baseUnitPriceCents + optionsUnitPriceCents;
      const effectiveBaseUnitPriceCents =
        submittedCustomUnitPriceCents === null
          ? baseUnitPriceCents
          : Math.max(0, unitPriceCents - optionsUnitPriceCents);
      const lineTotal = unitPriceCents * itemDto.qty;
      const lineKey = crypto.randomUUID();
      calculatedSubtotal += lineTotal;
      promotionLines.push({
        lineKey,
        productStableId: product.stableId,
        quantity: itemDto.qty,
        baseUnitPriceCents: product.basePriceCents,
        lineTotalCents: lineTotal,
        dailySpecial: activeSpecial,
        dailySpecialPriceApplied: submittedCustomUnitPriceCents === null,
      });

      const displayName =
        product.nameEn || product.nameZh || itemDto.displayName || 'Unknown';

      calculatedItems.push({
        id: lineKey,
        productStableId: itemDto.normalizedProductId,
        qty: itemDto.qty,
        displayName,
        nameEn: product.nameEn,
        nameZh: product.nameZh,
        unitPriceCents,
        baseUnitPriceCents: effectiveBaseUnitPriceCents,
        optionsUnitPriceCents,
        isDailySpecialApplied: Boolean(activeSpecial),
        dailySpecialStableId: activeSpecial?.stableId ?? null,
        optionsJson: optionsSnapshot.length
          ? (optionsSnapshot as Prisma.InputJsonValue)
          : undefined,
        componentsJson: componentSnapshots.length
          ? (componentSnapshots as Prisma.InputJsonValue)
          : undefined,
      });
    }

    return {
      calculatedItems,
      calculatedSubtotal,
      promotionLines,
    };
  }

  async preparePaymentOrder(
    dto: CreateOrderInput,
    storeStableIdRaw: string,
  ): Promise<PreparedPaymentOrderSnapshot> {
    if (dto.channel !== Channel.in_store) {
      throw new BadRequestException(
        'Phase D payment preparation currently accepts in-store orders only',
      );
    }
    const storeStableId = storeStableIdRaw.trim();
    if (!storeStableId) throw new BadRequestException('storeId is required');

    const pricing = await this.quoteOrderPricing(dto, {
      allowCustomUnitPrice: true,
    });
    const { calculatedItems, promotionLines } = await this.calculateLineItems(
      dto.items ?? [],
      { allowCustomUnitPrice: true },
    );

    const normalizedUserStableId = dto.userStableId
      ? normalizeStableId(dto.userStableId)
      : null;
    if (dto.userStableId && !normalizedUserStableId) {
      throw new BadRequestException('userStableId must be a cuid');
    }
    const userId = normalizedUserStableId
      ? await this.loyalty.resolveUserIdByStableId(normalizedUserStableId)
      : null;

    const couponInfo = await this.membership.validateCouponForOrder({
      userId: userId ?? undefined,
      couponStableId: dto.couponStableId,
    });

    const promotionRuleChannel = resolvePromotionRuleChannel(dto.channel);
    const promotionContext = promotionRuleChannel
      ? await this.promotions.getOrderPromotionContext(promotionRuleChannel)
      : undefined;
    const promotionEvaluation = evaluateOrderPromotions({
      lines: promotionLines,
      coupon: couponInfo?.coupon
        ? toCouponPromotionLike(couponInfo.coupon)
        : null,
      promotionContext,
      customer: { isMember: Boolean(userId) },
      posDiscountCents: dto.discountCents,
    });
    assertCouponPromotionAccepted(
      promotionEvaluation,
      couponInfo?.coupon?.couponStableId,
    );

    const snapshotCouponDiscountCents =
      resolveCouponPromotionDiscountCents(promotionEvaluation);
    const snapshotAutomaticPromotionDiscountCents =
      resolvePromotionDiscountCentsBySource(
        promotionEvaluation,
        'AUTOMATIC_PROMOTION',
      );
    const snapshotPosManualDiscountCents =
      resolvePromotionDiscountCentsBySource(
        promotionEvaluation,
        'POS_MANUAL_DISCOUNT',
      );
    if (
      snapshotCouponDiscountCents !== pricing.couponDiscountCents ||
      snapshotAutomaticPromotionDiscountCents !==
        pricing.automaticPromotionDiscountCents ||
      snapshotPosManualDiscountCents !== pricing.posManualDiscountCents
    ) {
      throw new ConflictException({
        code: 'PAYMENT_PREPARATION_PRICING_CHANGED',
        message: 'Order pricing changed while preparing payment. Please retry.',
      });
    }

    const snapshotSubtotalCents = calculatedItems.reduce(
      (sum, item) => sum + (item.unitPriceCents ?? 0) * item.qty,
      0,
    );
    if (snapshotSubtotalCents !== pricing.subtotalCents) {
      throw new ConflictException({
        code: 'PAYMENT_PREPARATION_PRICING_CHANGED',
        message: 'Item pricing changed while preparing payment. Please retry.',
      });
    }

    const requestedBalanceCents = Math.max(
      0,
      Math.round(dto.balanceUsedCents ?? 0),
    );
    const balanceCents = Math.min(requestedBalanceCents, pricing.totalCents);
    const tender: PaymentTenderAllocation = {
      pointsCents: pricing.loyaltyRedeemCents,
      balanceCents,
      couponDiscountCents: pricing.couponDiscountCents,
      orderTotalCents: pricing.totalCents,
      externalCents: Math.max(0, pricing.totalCents - balanceCents),
    };
    if (
      dto.paymentMethod === PaymentMethod.CARD &&
      typeof dto.totalCents === 'number' &&
      Number.isFinite(dto.totalCents) &&
      Math.round(dto.totalCents) !== tender.externalCents
    ) {
      throw new ConflictException({
        code: 'PAYMENT_DISPLAYED_TOTAL_CHANGED',
        message:
          'The server-calculated card amount no longer matches the amount shown on the POS. Refresh the payment screen before charging.',
        displayedExternalCents: Math.round(dto.totalCents),
        approvedExternalCents: tender.externalCents,
      });
    }

    return {
      version: 1,
      order: {
        ...dto,
        userStableId: normalizedUserStableId ?? undefined,
        redeemValueCents:
          pricing.loyaltyRedeemCents > 0
            ? pricing.loyaltyRedeemCents
            : undefined,
        balanceUsedCents: balanceCents > 0 ? balanceCents : undefined,
      },
      userId,
      storeId: storeStableId,
      pricing,
      tender,
      items: calculatedItems.map((item) => ({
        id: item.id ?? crypto.randomUUID(),
        productStableId: item.productStableId,
        qty: item.qty,
        displayName: item.displayName ?? null,
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        unitPriceCents: item.unitPriceCents ?? 0,
        baseUnitPriceCents: item.baseUnitPriceCents ?? 0,
        optionsUnitPriceCents: item.optionsUnitPriceCents ?? 0,
        isDailySpecialApplied: item.isDailySpecialApplied ?? false,
        dailySpecialStableId: item.dailySpecialStableId ?? null,
        optionsJson: item.optionsJson ?? null,
        componentsJson: item.componentsJson ?? null,
      })),
      promotionSnapshot: promotionEvaluation.snapshot,
      coupon: couponInfo?.coupon
        ? {
            id: couponInfo.coupon.id,
            couponStableId: couponInfo.coupon.couponStableId,
            code: couponInfo.coupon.code,
            title: couponInfo.coupon.title,
            minSpendCents: couponInfo.coupon.minSpendCents,
            expiresAt: couponInfo.coupon.expiresAt?.toISOString() ?? null,
          }
        : null,
      preparedAt: new Date().toISOString(),
    };
  }

  async createFromConfirmedPaymentSnapshot(
    snapshot: PreparedPaymentOrderSnapshot,
    input: {
      attemptId: string;
      internalOrderId: string;
      orderStableId: string;
      cardSurchargeCents: number;
      chargedTotalCents: number;
    },
  ): Promise<ConfirmedPaymentOrderResult> {
    if (snapshot.version !== 1 || snapshot.order.channel !== Channel.in_store) {
      throw new BadRequestException('Unsupported payment order snapshot');
    }
    if (!input.attemptId.trim()) {
      throw new BadRequestException('payment attemptId is required');
    }
    if (
      !Number.isSafeInteger(input.cardSurchargeCents) ||
      input.cardSurchargeCents < 0
    ) {
      throw new BadRequestException(
        'cardSurchargeCents must be a non-negative integer',
      );
    }
    if (
      !Number.isSafeInteger(input.chargedTotalCents) ||
      input.chargedTotalCents < 0
    ) {
      throw new BadRequestException(
        'chargedTotalCents must be a non-negative integer',
      );
    }

    const existing = await this.prisma.order.findUnique({
      where: { orderStableId: input.orderStableId },
      include: { items: true },
    });
    if (existing) {
      return {
        order: this.toOrderDto(existing as OrderWithItems),
        internalOrderId: existing.id,
      };
    }

    const paidAt = new Date();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const committedTender = await this.loyalty.commitPaymentTenderForOrder({
          tx,
          attemptId: input.attemptId,
          orderId: input.internalOrderId,
        });
        if (
          committedTender.pointsValueCents !== snapshot.tender.pointsCents ||
          committedTender.balanceCents !== snapshot.tender.balanceCents
        ) {
          throw new ConflictException({
            code: 'PAYMENT_TENDER_RESERVATION_MISMATCH',
            message:
              'Committed internal tender does not match prepared payment.',
          });
        }
        await this.membership.commitPaymentCouponsForOrder({
          tx,
          attemptId: input.attemptId,
          orderId: input.internalOrderId,
          orderStableId: input.orderStableId,
        });

        const clientRequestId = await this.allocateClientRequestIdTx(tx);
        const pickupCode =
          this.derivePickupCode(clientRequestId) ||
          (1000 + Math.floor(Math.random() * 9000)).toString();
        const subtotalAfterDiscountCents = Math.max(
          0,
          snapshot.pricing.subtotalCents -
            snapshot.pricing.posManualDiscountCents -
            snapshot.pricing.couponDiscountCents -
            snapshot.pricing.automaticPromotionDiscountCents -
            snapshot.pricing.loyaltyRedeemCents,
        );
        const paymentMethod =
          snapshot.tender.externalCents > 0
            ? PaymentMethod.CARD
            : PaymentMethod.STORE_BALANCE;

        return (await tx.order.create({
          data: {
            id: input.internalOrderId,
            status: 'paid',
            paidAt,
            paymentMethod,
            userId: snapshot.userId,
            orderStableId: input.orderStableId,
            clientRequestId,
            channel: snapshot.order.channel,
            storeId: snapshot.storeId,
            fulfillmentType: snapshot.order.fulfillmentType,
            contactName: snapshot.order.contactName ?? null,
            contactEmail: snapshot.order.contactEmail ?? null,
            contactPhone: snapshot.order.contactPhone ?? null,
            subtotalCents: snapshot.pricing.subtotalCents,
            taxCents: snapshot.pricing.taxCents,
            totalCents: snapshot.pricing.totalCents,
            paymentTotalCents:
              snapshot.pricing.totalCents + input.cardSurchargeCents,
            creditCardSurchargeCents: input.cardSurchargeCents,
            paymentBreakdownJson: {
              ...snapshot.tender,
              cardCents: snapshot.tender.externalCents,
              cardSurchargeCents: input.cardSurchargeCents,
              externalChargedCents: input.chargedTotalCents,
            } as Prisma.InputJsonValue,
            deliveryFeeCents: snapshot.pricing.deliveryFeeCents,
            deliveryCostCents: 0,
            deliverySubsidyCents: 0,
            pickupCode,
            couponId: snapshot.coupon?.id ?? null,
            couponDiscountCents: snapshot.pricing.couponDiscountCents,
            couponCodeSnapshot: snapshot.coupon?.code,
            couponTitleSnapshot: snapshot.coupon?.title,
            couponMinSpendCents: snapshot.coupon?.minSpendCents,
            couponExpiresAt: snapshot.coupon?.expiresAt
              ? new Date(snapshot.coupon.expiresAt)
              : null,
            promotionSnapshot:
              snapshot.promotionSnapshot as Prisma.InputJsonValue,
            loyaltyRedeemCents: snapshot.pricing.loyaltyRedeemCents,
            subtotalAfterDiscountCents,
            items: {
              create: snapshot.items.map((item) => ({
                id: item.id,
                productStableId: item.productStableId,
                qty: item.qty,
                displayName: item.displayName,
                nameEn: item.nameEn,
                nameZh: item.nameZh,
                unitPriceCents: item.unitPriceCents,
                baseUnitPriceCents: item.baseUnitPriceCents,
                optionsUnitPriceCents: item.optionsUnitPriceCents,
                isDailySpecialApplied: item.isDailySpecialApplied,
                dailySpecialStableId: item.dailySpecialStableId,
                ...(item.optionsJson !== null
                  ? {
                      optionsJson: item.optionsJson as Prisma.InputJsonValue,
                    }
                  : {}),
                ...(item.componentsJson != null
                  ? {
                      componentsJson:
                        item.componentsJson as Prisma.InputJsonValue,
                    }
                  : {}),
              })),
            },
          },
          include: { items: true },
        })) as OrderWithItems;
      });

      this.logger.log(
        `${this.formatOrderLogContext({
          orderId: created.id,
          orderStableId: created.orderStableId,
        })}Order created from immutable payment snapshot.`,
      );
      void this.handleOrderPaidSideEffects(created);
      return {
        order: this.toOrderDto(created),
        internalOrderId: created.id,
      };
    } catch (error) {
      if (this.getUniqueViolationTargets(error)) {
        const raced = await this.prisma.order.findUnique({
          where: { orderStableId: input.orderStableId },
          include: { items: true },
        });
        if (raced) {
          return {
            order: this.toOrderDto(raced as OrderWithItems),
            internalOrderId: raced.id,
          };
        }
      }
      throw error;
    }
  }

  async create(
    dto: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<OrderDto> {
    if (dto.channel !== Channel.web) {
      throw new BadRequestException(
        'Non-web order creation requires explicit authenticated store context',
      );
    }

    if (dto.channel === Channel.web) {
      const paymentMethod = this.resolvePaymentMethod(dto);
      if (paymentMethod === PaymentMethod.CARD) {
        const rawCheckoutIntentId =
          typeof dto.checkoutIntentId === 'string'
            ? dto.checkoutIntentId.trim()
            : '';
        const checkoutIntentId = rawCheckoutIntentId || null;

        if (!checkoutIntentId) {
          throw new BadRequestException({
            code: 'CHECKOUT_INTENT_REQUIRED',
            message:
              'checkoutIntentId is required for web card orders. Complete payment via Clover checkout before creating the order.',
          });
        }

        const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
          where: {
            OR: [{ referenceId: checkoutIntentId }, { id: checkoutIntentId }],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!checkoutIntent) {
          throw new BadRequestException({
            code: 'CHECKOUT_INTENT_NOT_FOUND',
            message: 'checkout intent not found',
          });
        }

        if (checkoutIntent.orderId) {
          const existingOrder = await this.prisma.order.findUnique({
            where: { id: checkoutIntent.orderId },
            include: { items: true },
          });
          if (existingOrder)
            return this.toOrderDto(existingOrder as OrderWithItems);

          throw new ConflictException({
            code: 'ORDER_NOT_FOUND',
            message:
              'checkout intent is already consumed by an order that cannot be loaded',
          });
        }

        if (
          checkoutIntent.status !== 'completed' &&
          checkoutIntent.status !== 'succeeded'
        ) {
          throw new ConflictException({
            code: 'CHECKOUT_NOT_COMPLETED',
            message: 'checkout intent is not completed',
            status: checkoutIntent.status,
          });
        }

        if (
          checkoutIntent.expiresAt &&
          checkoutIntent.expiresAt.getTime() < Date.now()
        ) {
          throw new ConflictException({
            code: 'CHECKOUT_INTENT_EXPIRED',
            message: 'checkout intent has expired',
          });
        }

        idempotencyKey = idempotencyKey ?? checkoutIntent.referenceId;
      }
    }

    const order = await this.createInternal(dto, idempotencyKey);

    if (
      dto.channel === Channel.web &&
      this.resolvePaymentMethod(dto) === PaymentMethod.CARD
    ) {
      const rawCheckoutIntentId =
        typeof dto.checkoutIntentId === 'string'
          ? dto.checkoutIntentId.trim()
          : '';
      const checkoutIntentId = rawCheckoutIntentId || null;
      if (checkoutIntentId) {
        await this.prisma.checkoutIntent.updateMany({
          where: {
            OR: [{ referenceId: checkoutIntentId }, { id: checkoutIntentId }],
            status: { in: ['completed', 'succeeded'] },
            orderId: null,
          },
          data: {
            orderId: order.id,
            processedAt: new Date(),
          },
        });
      }
    }

    return this.toOrderDto(order);
  }

  async createForStore(
    dto: CreateOrderInput,
    storeStableId: string,
  ): Promise<OrderDto> {
    const normalizedStoreStableId = storeStableId.trim();
    if (!normalizedStoreStableId) {
      throw new BadRequestException('storeStableId is required');
    }
    if (dto.channel === Channel.web) {
      throw new BadRequestException(
        'Store-scoped order creation does not accept channel=web',
      );
    }

    const order = await this.createInternal(
      dto,
      undefined,
      normalizedStoreStableId,
    );
    return this.toOrderDto(order);
  }

  async createInternal(
    dto: CreateOrderInput,
    idempotencyKey?: string,
    authenticatedStoreStableId?: string,
  ): Promise<OrderWithItems> {
    const contactPolicy = this.resolveContactPolicy(dto);
    const paymentMethod = this.resolvePaymentMethod(dto);
    const requiresCheckoutIntentVerification =
      dto.channel === Channel.web && paymentMethod === PaymentMethod.CARD;

    let verifiedCheckoutIntent: {
      id: string;
      referenceId: string;
      amountCents: number;
      creditCardSurchargeCents: number;
      paymentTotalCents: number;
      storeId: string | null;
    } | null = null;

    if (requiresCheckoutIntentVerification) {
      const rawCheckoutIntentId =
        typeof dto.checkoutIntentId === 'string'
          ? dto.checkoutIntentId.trim()
          : '';
      const checkoutIntentId = rawCheckoutIntentId || null;

      if (!checkoutIntentId) {
        throw new BadRequestException(
          'Missing payment proof (checkoutIntentId).',
        );
      }

      const intent = await this.prisma.checkoutIntent.findFirst({
        where: {
          OR: [{ referenceId: checkoutIntentId }, { id: checkoutIntentId }],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!intent) {
        throw new BadRequestException('Payment intent not found.');
      }

      const confirmedIntentStatuses = [
        'succeeded',
        'completed',
        // Clover card-token flow may claim the checkout intent before order
        // creation, which moves it into a transient processing state.
        'processing',
        'creating_order',
      ];

      if (!confirmedIntentStatuses.includes(intent.status)) {
        throw new BadRequestException(
          `Payment not confirmed. Status: ${intent.status}`,
        );
      }

      if (intent.expiresAt && intent.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException('Payment intent expired.');
      }

      if (intent.orderId) {
        const existingOrder = await this.prisma.order.findUnique({
          where: { id: intent.orderId },
          include: { items: true },
        });
        if (existingOrder) {
          return existingOrder as OrderWithItems;
        }
        throw new ConflictException('This payment has already been used.');
      }

      const intentMeta =
        intent.metadataJson && typeof intent.metadataJson === 'object'
          ? (intent.metadataJson as Record<string, unknown>)
          : null;
      const surchargeRaw = intentMeta?.creditCardSurchargeCents;
      const surchargeCents =
        typeof surchargeRaw === 'number' && Number.isFinite(surchargeRaw)
          ? Math.max(0, Math.round(surchargeRaw))
          : 0;

      verifiedCheckoutIntent = {
        id: intent.id,
        referenceId: intent.referenceId,
        amountCents: intent.amountCents,
        creditCardSurchargeCents: surchargeCents,
        paymentTotalCents: intent.amountCents + surchargeCents,
        storeId:
          typeof intentMeta?.serverVerifiedStoreId === 'string' &&
          intentMeta.serverVerifiedStoreId.trim()
            ? intentMeta.serverVerifiedStoreId.trim()
            : null,
      };
      idempotencyKey = idempotencyKey ?? intent.referenceId;
    }

    // ✅ 你的业务前提：只在“已收款/支付成功”后才创建订单记录
    const paidAt = new Date();
    // Website orders never take their routing identity from the request DTO.
    // Prefer the store stamped into the verified checkout context; legacy web
    // checkout flows use the deployment's controlled single-store config.
    // Authenticated store-channel callers must pass their trusted store identity
    // explicitly rather than relying on the deployment default.
    const storeId =
      dto.channel === Channel.web
        ? (verifiedCheckoutIntent?.storeId ?? resolveConfiguredStoreStableId())
        : authenticatedStoreStableId?.trim() || undefined;

    if (
      dto.deliveryType === DeliveryType.PRIORITY &&
      !dto.deliveryDestination
    ) {
      this.logger.warn(
        `Priority delivery order is missing deliveryDestination.`,
      );
    }

    // —— Idempotency
    const headerKey =
      typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined;
    const normalizedHeaderKey = normalizeStableId(headerKey);
    const bodyStableId =
      typeof dto.orderStableId === 'string'
        ? dto.orderStableId.trim()
        : undefined;
    const normalizedBodyStableId = normalizeStableId(bodyStableId);
    const providedClientRequestId =
      typeof dto.clientRequestId === 'string'
        ? dto.clientRequestId.trim()
        : undefined;
    const normalizedLegacyRequestId = normalizeStableId(
      providedClientRequestId,
    );
    const stableKey =
      normalizedHeaderKey ??
      normalizedBodyStableId ??
      normalizedLegacyRequestId;
    const legacyKey =
      providedClientRequestId && providedClientRequestId.length > 0
        ? providedClientRequestId
        : null;

    const rawUserStableId =
      typeof dto.userStableId === 'string' ? dto.userStableId.trim() : '';
    const normalizedUserStableId = rawUserStableId
      ? normalizeStableId(rawUserStableId)
      : null;
    if (rawUserStableId && !normalizedUserStableId) {
      throw new BadRequestException('userStableId must be a cuid');
    }
    const userId = normalizedUserStableId
      ? await this.loyalty.resolveUserIdByStableId(normalizedUserStableId)
      : undefined;

    const rawCouponStableId =
      typeof dto.couponStableId === 'string' ? dto.couponStableId.trim() : '';
    const normalizedCouponStableId = rawCouponStableId
      ? normalizeStableId(rawCouponStableId)
      : null;
    if (rawCouponStableId && !normalizedCouponStableId) {
      throw new BadRequestException('couponStableId must be a cuid');
    }
    if (stableKey || legacyKey) {
      const existing = await this.prisma.order.findFirst({
        where: {
          OR: [
            ...(stableKey
              ? [{ orderStableId: stableKey }, { clientRequestId: stableKey }]
              : []),
            ...(legacyKey ? [{ clientRequestId: legacyKey }] : []),
          ],
        },
        include: { items: true },
      });
      if (existing) return existing as OrderWithItems;
    }

    // —— Step 1: 服务端重算商品小计 (Security)
    const items = dto.items ?? [];
    const { calculatedItems, calculatedSubtotal, promotionLines } =
      await this.calculateLineItems(items, {
        allowCustomUnitPrice:
          dto.channel === Channel.in_store || dto.channel === Channel.ubereats,
      });
    const productStableIds = Array.from(
      new Set(calculatedItems.map((item) => item.productStableId)),
    );

    const subtotalCents = calculatedSubtotal;
    const pricingConfig = await this.getStorePricingConfig();
    const deliveryRulesFallback = this.buildDeliveryFallback(pricingConfig);
    const hasLoyaltyRedemptionInput =
      Boolean(userId) &&
      (typeof dto.pointsToRedeem === 'number' ||
        typeof dto.redeemValueCents === 'number');
    const loyaltyPolicy = hasLoyaltyRedemptionInput
      ? await this.loyaltyPolicyReader.getLoyaltyPolicySnapshot()
      : null;
    const requestedPoints = loyaltyPolicy
      ? resolveRequestedLoyaltyPoints(dto, loyaltyPolicy.redeemDollarPerPoint)
      : undefined;

    // —— Step 2: 配送费与税费 (动态计算 & 距离复验)
    const isDelivery =
      dto.fulfillmentType === 'delivery' ||
      dto.deliveryType === DeliveryType.STANDARD ||
      dto.deliveryType === DeliveryType.PRIORITY;

    const trustedDestination = await this.resolveTrustedDeliveryDestination(
      dto,
      userId,
    );
    if (trustedDestination) {
      dto.deliveryDestination = trustedDestination;
    }

    if (isDelivery && dto.deliveryDestination) {
      const dest = dto.deliveryDestination;
      const hasCoords =
        typeof dest.latitude === 'number' && typeof dest.longitude === 'number';

      if (!hasCoords && (dest.addressLine1 || dest.addressLine2)) {
        this.logger.log(
          `Missing coordinates for destination, geocoding now: ${dest.addressLine1}, ${dest.city}`,
        );
        try {
          // 拼接完整地址
          const fullAddr = [
            dest.addressLine1,
            dest.addressLine2,
            dest.city,
            dest.province,
            dest.postalCode,
          ]
            .filter(Boolean)
            .join(', ');

          const coords = await this.locationService.geocode(fullAddr);
          if (coords) {
            // 补全到 dest 对象上，后续逻辑就能用了
            dest.latitude = coords.latitude;
            dest.longitude = coords.longitude;
            this.logger.log(
              `✅ Geocoded successfully: [${coords.latitude}, ${coords.longitude}]`,
            );
          } else {
            this.logger.warn('❌ Geocoding failed, Uber call might fail.');
          }
        } catch (err) {
          this.logger.error(`Geocoding error: ${err}`);
        }
      }
    }

    let deliveryFeeCustomerCents = 0;
    const deliveryMeta = dto.deliveryType
      ? deliveryRulesFallback[dto.deliveryType]
      : undefined;

    if (isDelivery) {
      const targetType = dto.deliveryType ?? DeliveryType.PRIORITY;
      const dest = dto.deliveryDestination;

      // 只有当 店铺坐标 和 客户坐标 都存在时，才能动态计算
      if (
        Number.isFinite(pricingConfig.storeLatitude ?? NaN) &&
        Number.isFinite(pricingConfig.storeLongitude ?? NaN) &&
        dest &&
        typeof dest.latitude === 'number' &&
        typeof dest.longitude === 'number'
      ) {
        // 1. 计算距离
        const distKm = this.calculateDistanceKm(
          pricingConfig.storeLatitude as number,
          pricingConfig.storeLongitude as number,
          dest.latitude,
          dest.longitude,
        );

        // 2. 动态计费（如果超距会抛异常阻断下单）
        deliveryFeeCustomerCents = this.calculateDynamicDeliveryFee(
          targetType,
          distKm,
          pricingConfig,
        );

        this.logger.log(
          `Calculated dynamic delivery fee: ${deliveryFeeCustomerCents} cents for ${distKm.toFixed(
            2,
          )} km`,
        );
      } else {
        // 无法计算距离，回退到兜底逻辑
        this.logger.warn(
          `Cannot calculate dynamic delivery fee (missing coords). Store: [${pricingConfig.storeLatitude},${pricingConfig.storeLongitude}], Dest: [${dest?.latitude},${dest?.longitude}]. Falling back to fixed/frontend fee.`,
        );

        if (deliveryMeta) {
          deliveryFeeCustomerCents = deliveryMeta.feeCents;
        }
      }
    }

    // —— Step 3: 准备入库
    const contactName =
      dto.contactName?.trim() || dto.deliveryDestination?.name?.trim() || null;
    if (contactPolicy.requireCustomerName && !contactName) {
      throw new BadRequestException({
        code: 'CONTACT_NAME_REQUIRED',
        message: 'Customer name is required',
      });
    }
    const contactEmail = dto.contactEmail?.trim().toLowerCase() || null;
    const contactPhone =
      dto.contactPhone?.trim() ||
      dto.deliveryDestination?.phone?.trim() ||
      null;

    const orderId = crypto.randomUUID();
    const promotionRuleChannel = resolvePromotionRuleChannel(dto.channel);
    const promotionContext = promotionRuleChannel
      ? await this.promotions.getOrderPromotionContext(promotionRuleChannel)
      : undefined;

    // ✅ clientRequestId 由服务端生成：SQ + YYMMDD + 4位随机；并用 unique 冲突重试兜底
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const order: OrderWithItems = await this.prisma.$transaction(
          async (tx) => {
            const clientRequestId = this.isClientRequestId(
              providedClientRequestId,
            )
              ? providedClientRequestId
              : await this.allocateClientRequestIdTx(tx);
            const pickupCode =
              this.derivePickupCode(clientRequestId) ||
              (1000 + Math.floor(Math.random() * 9000)).toString();

            const hiddenItems = await tx.menuItem.findMany({
              where: {
                stableId: { in: productStableIds },
                deletedAt: null,
                visibility: 'HIDDEN',
              },
              select: { stableId: true },
            });
            if (dto.channel === Channel.web && hiddenItems.length > 0) {
              throw new BadRequestException(
                'hidden menu items are not available for customer ordering',
              );
            }

            const couponInfo = await this.membership.validateCouponForOrder(
              {
                userId,
                couponStableId: normalizedCouponStableId ?? undefined,
              },
              { tx },
            );
            const promotionEvaluation = evaluateOrderPromotions({
              lines: promotionLines,
              coupon: couponInfo?.coupon
                ? toCouponPromotionLike(couponInfo.coupon)
                : null,
              promotionContext,
              customer: { isMember: Boolean(userId) },
              posDiscountCents:
                dto.channel === Channel.in_store
                  ? dto.discountCents
                  : undefined,
            });
            assertCouponPromotionAccepted(
              promotionEvaluation,
              couponInfo?.coupon?.couponStableId,
            );

            const posDiscountCents = resolvePromotionDiscountCentsBySource(
              promotionEvaluation,
              'POS_MANUAL_DISCOUNT',
            );
            const couponDiscountCents =
              resolveCouponPromotionDiscountCents(promotionEvaluation);
            const automaticPromotionDiscountCents =
              resolvePromotionDiscountCentsBySource(
                promotionEvaluation,
                'AUTOMATIC_PROMOTION',
              );
            const subtotalAfterCoupon = Math.max(
              0,
              subtotalCents -
                posDiscountCents -
                couponDiscountCents -
                automaticPromotionDiscountCents,
            );

            const redeemValueCents = await this.loyalty.reserveRedeemForOrder({
              tx,
              userId,
              orderId,
              sourceKey: 'ORDER',
              requestedPoints,
              subtotalAfterCoupon,
            });

            // 储值余额支付
            const balanceUsedCents =
              dto.balanceUsedCents && dto.balanceUsedCents > 0
                ? dto.balanceUsedCents
                : 0;

            if (balanceUsedCents > 0) {
              if (!userId) {
                throw new BadRequestException(
                  'User required for balance payment',
                );
              }

              await this.loyalty.deductBalanceForOrder({
                tx,
                userId,
                orderId,
                amountCents: balanceUsedCents,
              });
            }

            // 税基计算：(小计 - POS优惠 - 优惠券 - 积分) + 配送费
            const purchaseBaseCents = Math.max(
              0,
              subtotalAfterCoupon - redeemValueCents,
            );
            const taxableCents =
              purchaseBaseCents + (isDelivery ? deliveryFeeCustomerCents : 0);
            const taxCents = Math.round(
              taxableCents * pricingConfig.salesTaxRate,
            );

            const totalCents =
              purchaseBaseCents + deliveryFeeCustomerCents + taxCents;

            const externalPaymentCents = Math.max(
              0,
              totalCents - Math.min(totalCents, balanceUsedCents),
            );
            if (
              verifiedCheckoutIntent &&
              externalPaymentCents !== verifiedCheckoutIntent.amountCents
            ) {
              throw new BadRequestException(
                `Price mismatch. order=${totalCents}, balance=${balanceUsedCents}, external=${externalPaymentCents}, paid=${verifiedCheckoutIntent.amountCents}`,
              );
            }
            const loyaltyRedeemCents = redeemValueCents;
            const subtotalAfterDiscountCents = Math.max(
              0,
              subtotalCents -
                posDiscountCents -
                couponDiscountCents -
                automaticPromotionDiscountCents -
                loyaltyRedeemCents,
            );

            if (verifiedCheckoutIntent) {
              const consumeIntent = await tx.checkoutIntent.updateMany({
                where: {
                  id: verifiedCheckoutIntent.id,
                  status: {
                    in: [
                      'succeeded',
                      'completed',
                      'processing',
                      'creating_order',
                    ],
                  },
                  orderId: null,
                },
                data: {
                  orderId,
                  processedAt: paidAt,
                },
              });

              if (consumeIntent.count === 0) {
                throw new ConflictException(
                  'This payment has already been used.',
                );
              }
            }

            const created = (await tx.order.create({
              data: {
                id: orderId,
                status: 'paid',
                paidAt,
                paymentMethod,
                userId: userId ?? null,
                ...(stableKey ? { orderStableId: stableKey } : {}),
                clientRequestId,
                channel: dto.channel,
                ...(storeId ? { storeId } : {}),
                fulfillmentType: dto.fulfillmentType,
                contactName,
                contactEmail,
                contactPhone,
                // 金额字段
                subtotalCents,
                taxCents,
                totalCents,
                paymentTotalCents:
                  verifiedCheckoutIntent?.paymentTotalCents ?? totalCents,
                creditCardSurchargeCents:
                  verifiedCheckoutIntent?.creditCardSurchargeCents ?? 0,
                ...(dto.channel === Channel.web
                  ? {
                      paymentBreakdownJson: {
                        pointsCents: loyaltyRedeemCents,
                        balanceCents: Math.min(totalCents, balanceUsedCents),
                        externalCents: externalPaymentCents,
                      },
                    }
                  : {}),
                deliveryFeeCents: deliveryFeeCustomerCents, // ⭐ 写入服务端计算的配送费
                deliveryCostCents: 0,
                deliverySubsidyCents: 0,
                pickupCode,
                couponId: couponInfo?.coupon?.id ?? null,
                couponDiscountCents,
                couponCodeSnapshot: couponInfo?.coupon?.code,
                couponTitleSnapshot: couponInfo?.coupon?.title,
                couponMinSpendCents: couponInfo?.coupon?.minSpendCents,
                couponExpiresAt: couponInfo?.coupon?.expiresAt,
                promotionSnapshot:
                  promotionEvaluation.snapshot as unknown as Prisma.InputJsonValue,
                loyaltyRedeemCents,
                subtotalAfterDiscountCents,
                ...(deliveryMeta
                  ? {
                      deliveryType: dto.deliveryType,
                      deliveryProvider: deliveryMeta.provider,
                      deliveryEtaMinMinutes: deliveryMeta.etaRange[0],
                      deliveryEtaMaxMinutes: deliveryMeta.etaRange[1],
                    }
                  : {}),
                items: {
                  create: calculatedItems,
                },
              },
              include: { items: true },
            })) as OrderWithItems;

            if (couponInfo?.coupon?.id) {
              await this.membership.reserveCouponForOrder({
                tx,
                userId,
                couponId: couponInfo.coupon.id,
                orderId,
              });
            }

            return created;
          },
        );

        this.logger.log(
          `${this.formatOrderLogContext({
            orderId: order.id,
            orderStableId: order.orderStableId ?? null,
          })}Order created successfully (Server-side price calculated). clientRequestId=${order.clientRequestId ?? 'null'}`,
        );

        if (order.status === 'paid') {
          void this.handleOrderPaidSideEffects(order);
        }

        return order;
      } catch (e: unknown) {
        const uniqueTargets = this.getUniqueViolationTargets(e);
        if (
          uniqueTargets &&
          uniqueTargets.some(
            (target) =>
              target.includes('orderStableId') ||
              target.includes('clientRequestId'),
          ) &&
          (stableKey || legacyKey)
        ) {
          const existing = await this.prisma.order.findFirst({
            where: {
              OR: [
                ...(stableKey
                  ? [
                      { orderStableId: stableKey },
                      { clientRequestId: stableKey },
                    ]
                  : []),
                ...(legacyKey ? [{ clientRequestId: legacyKey }] : []),
              ],
            },
            include: { items: true },
          });
          if (existing) return existing as OrderWithItems;
        }
        if (this.isClientRequestIdUniqueViolation(e)) {
          continue; // 冲突重试
        }
        throw e;
      }
    }
    throw new BadRequestException(
      'failed to create order (clientRequestId collisions)',
    );
  }

  async createLoyaltyOnlyOrder(params: {
    userStableId: string;
    fulfillmentType: FulfillmentType;
    deliveryType?: DeliveryType;
    deliveryDestination?: DeliveryDestinationInput;
    items: Array<{ productStableId: string; qty: number }>;
  }): Promise<OrderDto> {
    const {
      userStableId,
      fulfillmentType,
      deliveryType,
      deliveryDestination,
      items,
    } = params;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items are required');
    }

    const { calculatedSubtotal } = await this.calculateLineItems(items);

    const userId = await this.loyalty.resolveUserIdByStableId(userStableId);
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId },
      select: { pointsMicro: true },
    });
    const pointsMicro = account?.pointsMicro ?? 0n;
    const maxRedeemableCents =
      await this.loyalty.maxRedeemableCentsFromBalance(pointsMicro);

    if (maxRedeemableCents < calculatedSubtotal) {
      throw new BadRequestException('insufficient loyalty balance');
    }

    const normalizedDeliveryType =
      fulfillmentType === FulfillmentType.delivery
        ? (deliveryType ?? DeliveryType.PRIORITY)
        : undefined;

    const dto: CreateOrderInput = {
      userStableId,
      channel: 'web',
      fulfillmentType,
      deliveryType: normalizedDeliveryType,
      deliveryDestination,
      items,
      redeemValueCents: calculatedSubtotal,
    };

    const order = await this.createImmediatePaid(dto, dto.clientRequestId);
    return this.toOrderDto(order);
  }

  async createImmediatePaid(
    dto: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const created = await this.createInternal(dto, idempotencyKey);
    if (created.status === 'paid') return created;
    return this.updateStatusByInternalId(created.id, 'paid');
  }

  async recent(storeStableId: string, limit = 10): Promise<OrderDto[]> {
    const orders = (await this.prisma.order.findMany({
      where: this.trustedStoreOrderWhere(storeStableId),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })) as OrderWithItems[];

    return orders.map((o) => this.toOrderDto(o));
  }

  async board(
    storeStableId: string,
    params: {
      statusIn?: OrderStatus[];
      channelIn?: Array<'web' | 'in_store' | 'ubereats'>;
      limit?: number;
      sinceMinutes?: number;
      requireItems?: boolean;
    },
  ): Promise<OrderDto[]> {
    const {
      statusIn,
      channelIn,
      limit = 50,
      sinceMinutes = 24 * 60,
      requireItems = true,
    } = params;
    const where: Prisma.OrderWhereInput =
      this.trustedStoreOrderWhere(storeStableId);
    if (statusIn && statusIn.length > 0) where.status = { in: statusIn };
    if (channelIn && channelIn.length > 0) where.channel = { in: channelIn };
    if (requireItems) {
      where.items = { some: {} };
    }
    if (sinceMinutes > 0) {
      const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
      where.createdAt = { gte: since };
    }

    const orders = (await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })) as OrderWithItems[];

    return orders.map((o) => this.toOrderDto(o));
  }

  async getByStableId(orderStableId: string): Promise<OrderDto> {
    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: orderStableId.trim() },
      select: orderDetailSelect,
    })) as OrderDetail | null;

    if (!order) throw new NotFoundException('order not found');
    const loyaltyUsage = await this.getLoyaltyUsageByOrderStableId(
      order.orderStableId,
    );
    const dto = this.toOrderDto(order);
    return {
      ...dto,
      ...loyaltyUsage,
      externalPaidCents: Math.max(
        0,
        dto.totalCents - loyaltyUsage.balancePaidCents,
      ),
    };
  }

  async getByStableIdForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderDto> {
    const order = (await this.prisma.order.findFirst({
      where: {
        orderStableId: orderStableId.trim(),
        ...this.trustedStoreOrderWhere(storeStableId),
      },
      select: orderDetailSelect,
    })) as OrderDetail | null;

    if (!order) throw new NotFoundException('order not found');
    const loyaltyUsage = await this.getLoyaltyUsageByOrderStableId(
      order.orderStableId,
    );
    const dto = this.toOrderDto(order);
    return {
      ...dto,
      ...loyaltyUsage,
      externalPaidCents: Math.max(
        0,
        dto.totalCents - loyaltyUsage.balancePaidCents,
      ),
    };
  }

  async getByStableIdWithOwner(
    orderStableId: string,
  ): Promise<{ order: OrderDto; ownerUserStableId: string | null }> {
    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: orderStableId.trim() },
      select: orderDetailSelect,
    })) as OrderDetail | null;

    if (!order) throw new NotFoundException('order not found');
    const ownerUserStableId = order.userId
      ? ((
          await this.prisma.user.findUnique({
            where: { id: order.userId },
            select: { userStableId: true },
          })
        )?.userStableId ?? null)
      : null;
    const loyaltyUsage = await this.getLoyaltyUsageByOrderStableId(
      order.orderStableId,
    );
    const dto = this.toOrderDto(order);
    return {
      order: {
        ...dto,
        ...loyaltyUsage,
        externalPaidCents: Math.max(
          0,
          dto.totalCents - loyaltyUsage.balancePaidCents,
        ),
      },
      ownerUserStableId,
    };
  }

  async getPublicOrderSummary(orderStableId: string): Promise<OrderSummaryDto> {
    const value = (orderStableId ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    if (value.includes('-')) throw new BadRequestException('stableId only');

    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: value },
      include: { items: true },
    })) as OrderWithItems | null;

    if (!order) throw new NotFoundException('order not found');
    if (!order.orderStableId) {
      throw new BadRequestException('orderStableId missing');
    }

    const subtotalCents = order.subtotalCents ?? 0;
    const taxCents = order.taxCents ?? 0;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const discountCents = this.getTotalDiscountCents(order);
    const paymentMeta = await this.getCheckoutIntentPaymentMeta(order);
    const creditCardSurcharge = this.resolveOrderCreditCardSurcharge(
      order,
      paymentMeta,
    );
    const creditCardSurchargeCents = creditCardSurcharge?.cents ?? 0;
    const paymentTotalCents =
      typeof order.paymentTotalCents === 'number' &&
      Number.isFinite(order.paymentTotalCents) &&
      order.paymentTotalCents > 0
        ? Math.round(order.paymentTotalCents)
        : (order.totalCents ?? 0) + creditCardSurchargeCents;

    let itemCount = 0;
    const lineItems = order.items.map((item) => {
      const optionsSnapshot = Array.isArray(item.optionsJson)
        ? (item.optionsJson as OrderItemOptionsSnapshot)
        : null;

      const unitPriceCents = item.unitPriceCents ?? 0;
      const quantity = item.qty;
      const totalPriceCents = unitPriceCents * quantity;
      itemCount += quantity;

      const display =
        item.displayName || item.nameEn || item.nameZh || item.productStableId;
      const components = buildOrderItemComponentDisplaySnapshots(
        item.componentsJson,
        quantity,
        item.optionsJson,
      );

      return {
        productStableId: item.productStableId,
        name: display,
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        quantity,
        unitPriceCents,
        totalPriceCents,
        optionsJson: optionsSnapshot,
        ...(components.length > 0
          ? {
              displayOptions: buildOrderItemParentDisplayOptions(
                item.optionsJson,
                components,
              ),
              components,
            }
          : {}),
      };
    });

    const pricingDisplay = buildOrderPricingDisplay({
      effectiveSubtotalCents: subtotalCents,
      promotionSnapshot: order.promotionSnapshot,
      items: order.items,
      couponTitleSnapshot: order.couponTitleSnapshot ?? null,
      couponDiscountCents: order.couponDiscountCents ?? 0,
      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,
      subtotalAfterDiscountCents:
        order.subtotalAfterDiscountCents ?? subtotalCents,
    });
    const loyaltyUsage = await this.getLoyaltyUsageByOrderStableId(
      order.orderStableId,
    );
    const orderTotalCents = order.totalCents ?? 0;
    const externalPaidCents = Math.max(
      0,
      orderTotalCents - loyaltyUsage.balancePaidCents,
    );
    const orderNumber = order.clientRequestId ?? order.orderStableId;

    return {
      orderStableId: order.orderStableId,
      orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      fulfillmentType: order.fulfillmentType,
      itemCount,
      currency: 'CAD',
      subtotalCents,
      displaySubtotalCents: pricingDisplay.displaySubtotalCents,
      appliedDiscounts: pricingDisplay.discounts,
      taxCents,
      deliveryFeeCents,
      discountCents,
      totalCents: paymentTotalCents,
      orderTotalCents,
      paymentTotalCents,
      externalPaidCents,
      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,
      couponDiscountCents: order.couponDiscountCents ?? 0,
      creditCardSurchargeCents,
      creditCardSurchargeRate: creditCardSurcharge?.rate,
      chargeStatusUnverified: paymentMeta?.chargeStatusUnverified === true,
      chargeStatusUnverifiedReason:
        typeof paymentMeta?.chargeStatusUnverifiedReason === 'string'
          ? paymentMeta.chargeStatusUnverifiedReason
          : undefined,
      subtotalAfterDiscountCents:
        order.subtotalAfterDiscountCents ?? subtotalCents,
      ...loyaltyUsage,
      lineItems,
    };
  }

  private async getCheckoutIntentPaymentMeta(order: {
    clientRequestId?: string | null;
  }): Promise<Record<string, unknown> | null> {
    if (!order.clientRequestId) {
      return null;
    }

    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { referenceId: order.clientRequestId },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    const metadata =
      intent?.metadataJson && typeof intent.metadataJson === 'object'
        ? (intent.metadataJson as Record<string, unknown>)
        : null;

    return metadata;
  }

  private resolveOrderCreditCardSurcharge(
    order: {
      creditCardSurchargeCents?: number | null;
    },
    metadata: Record<string, unknown> | null,
  ): { cents: number; rate?: number } | null {
    const persistedSurcharge =
      typeof order.creditCardSurchargeCents === 'number' &&
      Number.isFinite(order.creditCardSurchargeCents)
        ? Math.max(0, Math.round(order.creditCardSurchargeCents))
        : 0;

    if (!metadata) {
      return persistedSurcharge > 0 ? { cents: persistedSurcharge } : null;
    }

    const centsRaw = metadata.creditCardSurchargeCents;
    const rateRaw = metadata.creditCardSurchargeRate;
    const cents =
      typeof centsRaw === 'number' && Number.isFinite(centsRaw)
        ? Math.max(0, Math.round(centsRaw))
        : 0;
    const rate =
      typeof rateRaw === 'number' && Number.isFinite(rateRaw) && rateRaw >= 0
        ? Math.round(rateRaw * 10) / 10
        : undefined;

    const finalCents = cents > 0 ? cents : persistedSurcharge;
    if (finalCents <= 0) return null;
    return { cents: finalCents, rate };
  }

  async sendInvoiceEmail(params: {
    orderStableId: string;
    email?: string | null;
    locale?: string;
  }): Promise<{ ok: boolean }> {
    return this.sendInvoice(params);
  }

  async sendInvoice(params: {
    orderStableId: string;
    email?: string | null;
    locale?: string;
  }): Promise<{ ok: boolean }> {
    const normalizedEmail = normalizeEmail(params.email);
    if (!normalizedEmail) {
      throw new BadRequestException('invalid_email');
    }

    const payload = await this.printPosPayloadService.getByStableId(
      params.orderStableId,
      params.locale,
    );
    await this.emailService.sendOrderInvoice({
      to: normalizedEmail,
      payload,
      locale: params.locale,
    });

    return { ok: true };
  }

  async updateStatus(
    orderStableId: string,
    next: OrderStatus,
  ): Promise<OrderDto> {
    const resolved =
      await this.resolveInternalOrderIdByStableIdOrThrow(orderStableId);
    const updated = await this.updateStatusByInternalId(resolved.id, next);
    return this.toOrderDto(updated);
  }

  async updateStatusForStore(
    orderStableId: string,
    storeStableId: string,
    next: OrderStatus,
  ): Promise<OrderDto> {
    const resolved = await this.resolveInternalOrderIdByStableIdForStoreOrThrow(
      orderStableId,
      storeStableId,
    );
    const updated = await this.updateStatusByInternalId(resolved.id, next);
    return this.toOrderDto(updated);
  }

  async updateStatusInternal(
    orderId: string,
    next: OrderStatus,
  ): Promise<OrderWithItems> {
    if (!this.isUuid(orderId)) {
      throw new BadRequestException('invalid order id');
    }
    return this.updateStatusByInternalId(orderId, next);
  }

  // =========================
  // Amendments (方案 B 的入口)
  // =========================

  /**
   * Uber and Web orders with external payment remain pending until their
   * provider/manual reversal is confirmed. In-store orders and Web orders with
   * external=0 can be finalized internally because there is no provider money
   * to reverse.
   */
  async createFullRefund(params: {
    orderStableId: string;
    reason: string;
    refundAmountCents: number;
    originalPaymentMethod: PaymentMethod;
    refundMethod: PaymentMethod;
  }): Promise<{
    order: OrderDto;
    outcome: 'pending_platform' | 'pending_manual' | 'refunded';
  }> {
    if (!params.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }
    if (
      !Number.isInteger(params.refundAmountCents) ||
      params.refundAmountCents < 0
    ) {
      throw new BadRequestException(
        'refundAmountCents must be a non-negative integer',
      );
    }

    // Restore loyalty effects (including actual STORE_BALANCE settlement)
    // before recording any refund that can be finalized without a provider.
    // rollbackOnRefund is ledger-idempotent, so a retry after a later database
    // failure is safe.
    const refundableOrder = await this.prisma.order.findUnique({
      where: { orderStableId: params.orderStableId },
      select: {
        id: true,
        channel: true,
        paymentMethod: true,
        paymentBreakdownJson: true,
        status: true,
        totalCents: true,
      },
    });
    const refundableExternalCents =
      refundableOrder?.channel === Channel.web
        ? await this.resolveExternalPaymentCents(refundableOrder)
        : null;
    const isWebZeroExternal =
      refundableOrder?.channel === Channel.web && refundableExternalCents === 0;
    const canFinalizeInternally =
      refundableOrder?.channel === Channel.in_store || isWebZeroExternal;

    if (canFinalizeInternally && refundableOrder) {
      if (refundableOrder.status === 'refunded') {
        throw new ConflictException('order is already refunded');
      }
      if (
        params.originalPaymentMethod !== refundableOrder.paymentMethod ||
        params.refundMethod === PaymentMethod.UBEREATS ||
        params.refundAmountCents !== refundableOrder.totalCents
      ) {
        throw new BadRequestException('invalid internal full refund request');
      }
      if (
        (refundableOrder.paymentMethod === PaymentMethod.STORE_BALANCE ||
          isWebZeroExternal) &&
        params.refundMethod !== PaymentMethod.STORE_BALANCE
      ) {
        throw new BadRequestException(
          'zero-external benefits refunds must return through STORE_BALANCE',
        );
      }
      await this.loyalty.rollbackOnRefund(refundableOrder.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveInternalOrderIdByStableIdOrThrow(
        params.orderStableId,
        tx,
      );
      const order = await tx.order.findUnique({
        where: { id: resolved.id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.status === 'refunded') {
        throw new ConflictException('order is already refunded');
      }
      if (order.paymentMethod !== params.originalPaymentMethod) {
        throw new BadRequestException(
          'originalPaymentMethod does not match order',
        );
      }
      const isUber = order.channel === Channel.ubereats;
      const isInStore = order.channel === Channel.in_store;
      const isWebZeroExternal =
        order.channel === Channel.web && refundableExternalCents === 0;
      const canFinalizeInternally = isInStore || isWebZeroExternal;
      if (
        isUber &&
        (params.originalPaymentMethod !== PaymentMethod.UBEREATS ||
          params.refundMethod !== PaymentMethod.UBEREATS)
      ) {
        throw new BadRequestException(
          'UberEats refunds must return through UBEREATS',
        );
      }
      if (!isUber && params.refundMethod === PaymentMethod.UBEREATS) {
        throw new BadRequestException(
          'UBEREATS refund method is only valid for UberEats orders',
        );
      }
      if (
        isWebZeroExternal &&
        params.refundMethod !== PaymentMethod.STORE_BALANCE
      ) {
        throw new BadRequestException(
          'zero-external Web refunds must return through STORE_BALANCE',
        );
      }
      if (params.refundAmountCents !== order.totalCents) {
        throw new BadRequestException(
          'full refund amount must equal order total',
        );
      }

      const existing = await tx.orderAmendment.findFirst({
        where: {
          orderId: order.id,
          summaryJson: { path: ['kind'], equals: 'FULL_REFUND' },
        },
      });
      if (!canFinalizeInternally) {
        if (!existing) {
          await tx.orderAmendment.upsert({
            where: { amendmentStableId: `full_refund_${order.id}` },
            create: {
              amendmentStableId: `full_refund_${order.id}`,
              orderId: order.id,
              type: OrderAmendmentType.RETENDER,
              paymentMethod: params.refundMethod,
              reason: params.reason.trim(),
              refundCents: 0,
              summaryJson: {
                kind: 'FULL_REFUND',
                status: isUber ? 'PENDING_PLATFORM' : 'PENDING_MANUAL',
                requestedRefundCents: params.refundAmountCents,
                originalPaymentMethod: params.originalPaymentMethod,
                refundMethod: params.refundMethod,
                originalChannel: order.channel,
              },
            },
            update: {},
          });
        }
        return order;
      }

      // The conditional write is the concurrency guard: only one request can
      // move this order to refunded, even when two POS requests race.
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: { not: 'refunded' } },
        data: { status: 'refunded' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('order is already refunded');
      }

      const amendmentData = {
        orderId: order.id,
        type: OrderAmendmentType.RETENDER,
        paymentMethod: params.refundMethod,
        reason: params.reason.trim(),
        deltaCents: -params.refundAmountCents,
        refundCents: params.refundAmountCents,
        summaryJson: {
          kind: 'FULL_REFUND',
          status: 'CONFIRMED',
          requestedRefundCents: params.refundAmountCents,
          originalPaymentMethod: params.originalPaymentMethod,
          refundMethod: params.refundMethod,
          originalChannel: order.channel,
          ...(isWebZeroExternal
            ? {
                externalPaymentCents: 0,
                settlementScope: 'INTERNAL_BENEFITS',
              }
            : {}),
        },
      } satisfies Prisma.OrderAmendmentUncheckedCreateInput;
      if (existing) {
        await tx.orderAmendment.update({
          where: { id: existing.id },
          data: amendmentData,
        });
      } else {
        await tx.orderAmendment.upsert({
          where: { amendmentStableId: `full_refund_${order.id}` },
          create: {
            amendmentStableId: `full_refund_${order.id}`,
            ...amendmentData,
          },
          update: {},
        });
      }
      const completed = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });
      if (!completed) throw new NotFoundException('order not found');
      return completed;
    });

    return {
      order: this.toOrderDto(updated),
      outcome:
        updated.channel === Channel.ubereats
          ? 'pending_platform'
          : updated.channel === Channel.in_store ||
              (updated.channel === Channel.web && refundableExternalCents === 0)
            ? 'refunded'
            : 'pending_manual',
    };
  }

  /**
   * 退菜/改价：创建 OrderAmendment（方案 B）
   */
  async createAmendment(params: {
    orderStableId: string;
    type: OrderAmendmentType;
    reason: string;

    items?: Array<{
      action: OrderAmendmentItemAction;
      productStableId: string;
      qty: number;
      unitPriceCents?: number | null;
      displayName?: string | null;
      nameEn?: string | null;
      nameZh?: string | null;
      optionsJson?: Prisma.InputJsonValue;
    }>;

    paymentMethod?: PaymentMethod | null;

    refundGrossCents?: number; // “应退总额”（现金退 + 返积分）
    additionalChargeCents?: number; // “应补收总额”
  }): Promise<OrderDto> {
    const orderStableId = params.orderStableId;
    const reason = params.reason;
    const type = params.type;
    const items = Array.isArray(params.items) ? params.items : [];
    const paymentMethod: PaymentMethod | null = params.paymentMethod ?? null;

    const toNonNegInt = (v: unknown): number => {
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.round(v))
        : 0;
    };

    const refundGrossCentsRaw = toNonNegInt(params.refundGrossCents);
    const additionalChargeCentsRaw = toNonNegInt(params.additionalChargeCents);

    if (!orderStableId) {
      throw new BadRequestException('orderStableId is required');
    }
    if (!reason?.trim()) throw new BadRequestException('reason is required');

    const hasVoid = items.some(
      (i) => i.action === OrderAmendmentItemAction.VOID,
    );
    const hasAdd = items.some((i) => i.action === OrderAmendmentItemAction.ADD);

    if (type === OrderAmendmentType.RETENDER) {
      if (items.length > 0) {
        throw new BadRequestException('RETENDER does not accept items');
      }
      if (refundGrossCentsRaw <= 0 && additionalChargeCentsRaw <= 0) {
        throw new BadRequestException(
          'RETENDER requires refundGrossCents > 0 or additionalChargeCents > 0',
        );
      }
    } else {
      if (items.length === 0) {
        if (
          type === OrderAmendmentType.ADDITIONAL_CHARGE &&
          additionalChargeCentsRaw > 0
        ) {
          // ok：纯补收不带 item
        } else {
          throw new BadRequestException('items is required');
        }
      }
    }

    if (type === OrderAmendmentType.VOID_ITEM && (!hasVoid || hasAdd)) {
      throw new BadRequestException('VOID_ITEM requires VOID items only');
    }
    if (type === OrderAmendmentType.SWAP_ITEM && !(hasVoid && hasAdd)) {
      throw new BadRequestException(
        'SWAP_ITEM requires both VOID and ADD items',
      );
    }
    if (type === OrderAmendmentType.ADDITIONAL_CHARGE && hasVoid) {
      throw new BadRequestException(
        'ADDITIONAL_CHARGE cannot include VOID items',
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      // ✅ 外部 orderId 允许 stableId/uuid；这里统一 resolve 成内部 UUID
      const resolved = await this.resolveInternalOrderIdByStableIdOrThrow(
        orderStableId,
        tx,
      );
      const internalOrderId = resolved.id;

      const order = await tx.order.findUnique({
        where: { id: internalOrderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('order not found');
      if (!['paid', 'making', 'ready', 'completed'].includes(order.status)) {
        throw new BadRequestException(
          'only paid/fulfilled order can be amended',
        );
      }

      const amendment = await tx.orderAmendment.create({
        data: {
          orderId: internalOrderId, // ✅ 外键必须 UUID
          type,
          paymentMethod,
          reason: reason.trim(),
          deltaCents: 0,
          refundCents: 0,
          additionalChargeCents: 0,
          redeemReturnCents: 0,
          redeemReturnMicro: 0n,
          earnAdjustMicro: 0n,
          referralAdjustMicro: 0n,
        },
        select: { id: true, amendmentStableId: true, orderId: true },
      });

      // 2) 写 amendment items（允许为空：RETENDER / 纯补收）
      if (items.length > 0) {
        await tx.orderAmendmentItem.createMany({
          data: items.map((it) => {
            const rawAction = it.action as unknown;
            let action: OrderAmendmentItemAction;
            if (
              rawAction === OrderAmendmentItemAction.VOID ||
              rawAction === 'VOID'
            ) {
              action = OrderAmendmentItemAction.VOID;
            } else if (
              rawAction === OrderAmendmentItemAction.ADD ||
              rawAction === 'ADD'
            ) {
              action = OrderAmendmentItemAction.ADD;
            } else {
              throw new BadRequestException(
                `invalid amendment item action: ${String(rawAction)}`,
              );
            }

            if (!Number.isFinite(it.qty) || it.qty <= 0) {
              throw new BadRequestException('qty must be > 0');
            }

            const base = {
              amendmentId: amendment.id,
              action,
              productStableId: it.productStableId,
              displayName: it.displayName ?? null,
              nameEn: it.nameEn ?? null,
              nameZh: it.nameZh ?? null,
              qty: Math.round(it.qty),
              unitPriceCents:
                typeof it.unitPriceCents === 'number' &&
                Number.isFinite(it.unitPriceCents)
                  ? Math.round(it.unitPriceCents)
                  : null,
            };

            return it.optionsJson !== undefined
              ? {
                  ...base,
                  optionsJson: it.optionsJson,
                }
              : base;
          }),
        });
      }

      // 3) 方案 B：退款拆分（现金退上限 + 超出返积分） + netSpend（考虑补收）
      const orderUserId = order.userId;

      const originalCashPaidCents = Math.max(0, order.totalCents ?? 0);
      const originalRedeemCents = Math.max(0, order.loyaltyRedeemCents ?? 0);

      const agg = await tx.orderAmendment.aggregate({
        where: { orderId: internalOrderId },
        _sum: { refundCents: true, redeemReturnCents: true },
      });

      const refundedCashAlready = Math.max(0, agg._sum.refundCents ?? 0);
      const returnedRedeemAlready = Math.max(
        0,
        agg._sum.redeemReturnCents ?? 0,
      );

      const remainingCashRefundable = Math.max(
        0,
        originalCashPaidCents - refundedCashAlready,
      );
      const remainingRedeemRefundable = Math.max(
        0,
        originalRedeemCents - returnedRedeemAlready,
      );

      const maxRefundableCents =
        remainingCashRefundable + remainingRedeemRefundable;

      const boundedRefundGrossCents = Math.min(
        refundGrossCentsRaw,
        maxRefundableCents,
      );

      // 规则：先退现金，超出部分返还积分
      const redeemReturnCents = Math.min(
        remainingRedeemRefundable,
        Math.max(0, boundedRefundGrossCents - remainingCashRefundable),
      );
      const refundCashCents = Math.max(
        0,
        boundedRefundGrossCents - redeemReturnCents,
      );

      const baseNetSubtotalCents = Math.max(
        0,
        typeof order.subtotalAfterDiscountCents === 'number'
          ? order.subtotalAfterDiscountCents
          : (order.subtotalCents ?? 0) -
              (order.couponDiscountCents ?? 0) -
              (order.loyaltyRedeemCents ?? 0),
      );

      const newNetSubtotalCents = Math.max(
        0,
        baseNetSubtotalCents - refundCashCents + additionalChargeCentsRaw,
      );

      let redeemReturnMicro = 0n;
      let earnAdjustMicro = 0n;
      let referralAdjustMicro = 0n;

      const shouldTouchLoyalty =
        Boolean(orderUserId) &&
        (redeemReturnCents > 0 || baseNetSubtotalCents !== newNetSubtotalCents);

      if (shouldTouchLoyalty) {
        const r = await this.loyalty.applyAmendmentAdjustments({
          tx,
          orderId: internalOrderId,
          userId: orderUserId!,
          amendmentStableId: amendment.amendmentStableId,
          baseNetSubtotalCents,
          newNetSubtotalCents,
          redeemReturnCents,
        });

        redeemReturnMicro = r.redeemReturnMicro;
        earnAdjustMicro = r.earnAdjustMicro;
        referralAdjustMicro = r.referralAdjustMicro;
      }

      // 4) 回写 amendment
      const deltaCentsSigned = additionalChargeCentsRaw - refundCashCents;

      await tx.orderAmendment.update({
        where: { id: amendment.id },
        data: {
          deltaCents: deltaCentsSigned,
          refundCents: refundCashCents,
          additionalChargeCents: additionalChargeCentsRaw,

          redeemReturnCents,
          redeemReturnMicro,
          earnAdjustMicro,
          referralAdjustMicro,

          // 如果 schema 没有 summaryJson 字段：删除这一段
          summaryJson: {
            refundGrossCentsInput: refundGrossCentsRaw,
            refundGrossCentsBounded: boundedRefundGrossCents,
            refundCashCents,
            redeemReturnCents,
            additionalChargeCents: additionalChargeCentsRaw,
            deltaCentsSigned,
            baseNetSubtotalCents,
            newNetSubtotalCents,
          } as Prisma.InputJsonValue,
        },
      });

      const voidItems = items.filter(
        (item) => item.action === OrderAmendmentItemAction.VOID,
      );
      const addItems = items.filter(
        (item) => item.action === OrderAmendmentItemAction.ADD,
      );

      const parsedOrderItems = order.items.map((item) => ({
        id: item.id,
        productStableId: item.productStableId,
        qty: Math.max(0, item.qty ?? 0),
        unitPriceCents: item.unitPriceCents ?? 0,
      }));

      let removedSubtotalCents = 0;
      if (voidItems.length > 0) {
        for (const voidItem of voidItems) {
          let remainingQty = Math.max(0, Math.round(voidItem.qty));
          if (remainingQty <= 0) continue;

          const candidates = parsedOrderItems.filter(
            (it) =>
              it.productStableId === voidItem.productStableId && it.qty > 0,
          );

          for (const candidate of candidates) {
            if (remainingQty <= 0) break;
            const removedQty = Math.min(candidate.qty, remainingQty);
            if (removedQty <= 0) continue;
            removedSubtotalCents +=
              removedQty * (candidate.unitPriceCents ?? 0);
            remainingQty -= removedQty;
            candidate.qty -= removedQty;

            if (candidate.qty <= 0) {
              await tx.orderItem.delete({ where: { id: candidate.id } });
            } else {
              await tx.orderItem.update({
                where: { id: candidate.id },
                data: { qty: candidate.qty },
              });
            }
          }
        }
      }

      let addedSubtotalCents = 0;
      if (addItems.length > 0) {
        for (const addItem of addItems) {
          const addQty = Math.max(0, Math.round(addItem.qty));
          const unitPriceCents =
            typeof addItem.unitPriceCents === 'number' &&
            Number.isFinite(addItem.unitPriceCents)
              ? Math.round(addItem.unitPriceCents)
              : 0;
          if (addQty <= 0) continue;
          addedSubtotalCents += addQty * unitPriceCents;

          await tx.orderItem.create({
            data: {
              orderId: internalOrderId,
              productStableId: addItem.productStableId,
              qty: addQty,
              unitPriceCents,
              displayName: addItem.displayName ?? null,
              nameEn: addItem.nameEn ?? null,
              nameZh: addItem.nameZh ?? null,
              optionsJson:
                addItem.optionsJson !== undefined
                  ? addItem.optionsJson
                  : Prisma.JsonNull,
            },
          });
        }
      }

      if (voidItems.length > 0 || addItems.length > 0) {
        const baseSubtotalCents = Math.max(0, order.subtotalCents ?? 0);
        const baseSubtotalAfterDiscountCents = Math.max(
          0,
          order.subtotalAfterDiscountCents ?? 0,
        );
        const baseTaxCents = Math.max(0, order.taxCents ?? 0);
        const baseDiscountCents = Math.max(
          0,
          baseSubtotalCents - baseSubtotalAfterDiscountCents,
        );

        const nextSubtotalCents = Math.max(
          0,
          baseSubtotalCents - removedSubtotalCents + addedSubtotalCents,
        );
        const nextDiscountCents =
          baseSubtotalCents > 0
            ? Math.round(
                (baseDiscountCents * nextSubtotalCents) / baseSubtotalCents,
              )
            : 0;
        const nextSubtotalAfterDiscountCents = Math.max(
          0,
          nextSubtotalCents - nextDiscountCents,
        );
        const taxRate =
          baseSubtotalAfterDiscountCents > 0
            ? baseTaxCents / baseSubtotalAfterDiscountCents
            : 0;
        const nextTaxCents = Math.max(
          0,
          Math.round(nextSubtotalAfterDiscountCents * taxRate),
        );
        const nextTotalCents =
          nextSubtotalAfterDiscountCents +
          nextTaxCents +
          Math.max(0, order.deliveryFeeCents ?? 0);

        await tx.order.update({
          where: { id: internalOrderId },
          data: {
            subtotalCents: nextSubtotalCents,
            subtotalAfterDiscountCents: nextSubtotalAfterDiscountCents,
            taxCents: nextTaxCents,
            totalCents: nextTotalCents,
            paymentTotalCents: nextTotalCents,
          },
        });
      }

      if (paymentMethod !== null) {
        await tx.order.update({
          where: { id: internalOrderId },
          data: { paymentMethod },
        });
      }

      // 5) 返回最新 order
      return (await tx.order.findUnique({
        where: { id: internalOrderId },
        include: { items: true },
      })) as OrderWithItems;
    });

    return this.toOrderDto(updatedOrder);
  }

  /**
   * ✅ 对外 advance
   */
  async advance(orderStableId: string): Promise<OrderDto> {
    const resolved =
      await this.resolveInternalOrderIdByStableIdOrThrow(orderStableId);

    const order = await this.prisma.order.findUnique({
      where: { id: resolved.id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = ORDER_STATUS_ADVANCE_FLOW[order.status];
    if (!next) {
      const current = (await this.prisma.order.findUnique({
        where: { id: resolved.id },
        include: { items: true },
      })) as OrderWithItems;
      return this.toOrderDto(current);
    }

    const updated = await this.updateStatusByInternalId(resolved.id, next);
    return this.toOrderDto(updated);
  }

  async advanceForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderDto> {
    const resolved = await this.resolveInternalOrderIdByStableIdForStoreOrThrow(
      orderStableId,
      storeStableId,
    );

    const order = await this.prisma.order.findUnique({
      where: { id: resolved.id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = ORDER_STATUS_ADVANCE_FLOW[order.status];
    if (!next) {
      const current = (await this.prisma.order.findUnique({
        where: { id: resolved.id },
        include: { items: true },
      })) as OrderWithItems;
      return this.toOrderDto(current);
    }

    const updated = await this.updateStatusByInternalId(resolved.id, next);
    return this.toOrderDto(updated);
  }

  private normalizeDropoff(
    destination: DeliveryDestinationInput,
  ): UberDirectDropoffDetails {
    const sanitize = (value?: string | null): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };
    const phone = sanitize(destination.phone);
    if (!phone) {
      throw new BadRequestException({
        code: 'DELIVERY_PHONE_REQUIRED',
        message: 'A mobile phone number is required for delivery',
      });
    }
    return {
      name: sanitize(destination.name) ?? destination.name,
      phone,
      company: sanitize(destination.company),
      addressLine1:
        sanitize(destination.addressLine1) ?? destination.addressLine1,
      addressLine2: sanitize(destination.addressLine2),
      city: sanitize(destination.city) ?? destination.city,
      province: sanitize(destination.province) ?? destination.province,
      postalCode: sanitize(destination.postalCode) ?? destination.postalCode,
      country: sanitize(destination.country) ?? 'Canada',
      instructions: sanitize(destination.instructions),
      notes: sanitize(destination.notes),
      latitude:
        typeof destination.latitude === 'number'
          ? destination.latitude
          : undefined,
      longitude:
        typeof destination.longitude === 'number'
          ? destination.longitude
          : undefined,
      tipCents:
        typeof destination.tipCents === 'number'
          ? Math.max(0, Math.round(destination.tipCents))
          : undefined,
    };
  }

  private buildUberPickupOverride(
    config: StoreConfigSnapshot,
  ): UberDirectPickupDetails | undefined {
    const sanitize = (value?: string | null): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const pickup: UberDirectPickupDetails = {
      businessName: sanitize(config.storeName),
      contactName: sanitize(config.contactName) ?? sanitize(config.storeName),
      phone: sanitize(config.phone),
      addressLine1: sanitize(config.addressLine1),
      addressLine2: sanitize(config.addressLine2),
      city: sanitize(config.city),
      province: sanitize(config.province),
      postalCode: sanitize(config.postalCode),
      latitude:
        typeof config.latitude === 'number' ? config.latitude : undefined,
      longitude:
        typeof config.longitude === 'number' ? config.longitude : undefined,
    };

    const hasOverrides = Object.values(pickup).some(
      (value) => value !== undefined && value !== null,
    );

    return hasOverrides ? pickup : undefined;
  }

  private formatOrderLogContext(params?: {
    orderId?: string | null;
    orderStableId?: string | null;
  }): string {
    const parts: string[] = [];
    if (params?.orderId) parts.push(`orderId=${params.orderStableId}`);
    if (params?.orderStableId)
      parts.push(`orderStableId=${params.orderStableId}`);
    return parts.length ? `[${parts.join(' ')}] ` : '';
  }

  private async dispatchPriorityDelivery(
    order: OrderWithItems,
    destination: UberDirectDropoffDetails,
    pickup?: UberDirectPickupDetails,
  ): Promise<OrderWithItems> {
    const thirdPartyOrderRef = order.clientRequestId;
    if (!thirdPartyOrderRef) {
      throw new BadRequestException('clientRequestId required for delivery');
    }
    const humanRef = order.clientRequestId ?? order.orderStableId ?? '';

    // 1. 如果手机号包含星号 '*' 且订单属于某个会员，尝试去数据库查真实号码
    if (destination.phone && destination.phone.includes('*') && order.userId) {
      this.logger.log(
        `⚠️ [Uber Fix] Detected masked phone "${destination.phone}". Fetching real phone for user ${order.userId}...`,
      );

      const user = await this.prisma.user.findUnique({
        where: { id: order.userId },
        select: { phone: true, phoneVerifiedAt: true },
      });

      const verifiedPhone =
        user?.phone && user.phoneVerifiedAt
          ? this.normalizeCanadianDeliveryPhone(user.phone)
          : null;
      if (verifiedPhone) {
        destination.phone = verifiedPhone;
        this.logger.log(`✅ [Uber Fix] Restored real phone from database.`);
      } else {
        throw new BadRequestException({
          code: 'DELIVERY_PHONE_REQUIRED',
          message: 'A verified mobile phone number is required for delivery',
        });
      }
    }

    // 2. 格式标准化：确保发送给 Uber Direct 的一定是有效 E.164 号码
    const normalizedPhone = this.normalizeCanadianDeliveryPhone(
      destination.phone,
    );
    if (!normalizedPhone) {
      throw new BadRequestException({
        code: 'DELIVERY_PHONE_INVALID',
        message: 'Delivery phone must be a valid Canadian phone number',
      });
    }
    destination.phone = normalizedPhone;

    const response: UberDirectDeliveryResult =
      await this.uberDirect.createDelivery({
        orderRef: thirdPartyOrderRef, // ✅ 外发：优先 clientRequestId
        pickupCode: order.pickupCode ?? undefined,
        reference: humanRef,
        totalCents: order.totalCents ?? 0,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
        pickup,
      });

    const updateData: Prisma.OrderUpdateInput = {
      externalDeliveryId: response.deliveryId,
    };

    if (typeof response.deliveryCostCents === 'number') {
      const cost = Math.max(0, Math.round(response.deliveryCostCents));
      updateData.deliveryCostCents = cost;

      const fee = Math.max(0, order.deliveryFeeCents ?? 0);
      updateData.deliverySubsidyCents = Math.max(0, cost - fee);
    }
    return this.prisma.order.update({
      where: { id: order.id }, // ✅ 内部写库仍用 UUID
      data: updateData,
      include: { items: true },
    }) as Promise<OrderWithItems>;
  }

  private async notifyDeliveryDispatchFailureAlert(params: {
    order: OrderWithItems;
    provider: DeliveryProvider;
    errorMessage: string;
  }): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          status: 'ACTIVE',
          phone: { not: null },
        },
        select: {
          id: true,
          phone: true,
          language: true,
        },
      });

      if (admins.length === 0) {
        this.logger.warn(
          `No admin phone found for delivery dispatch failure alert. orderStableId=${params.order.orderStableId ?? 'null'}`,
        );
        return;
      }

      const publicBaseUrl = (
        process.env.PUBLIC_BASE_URL ?? 'https://sanq.ca'
      ).replace(/\/$/, '');
      const orderIdentifier = params.order.orderStableId ?? params.order.id;
      const orderDetailUrl = `${publicBaseUrl}/zh/order/${orderIdentifier}`;

      const result =
        await this.notificationService.notifyDeliveryDispatchFailed({
          recipients: admins.map((admin) => ({
            phone: admin.phone ?? '',
            locale: admin.language === 'ZH' ? 'zh' : 'en',
            userId: admin.id,
          })),
          orderNumber:
            params.order.clientRequestId ??
            params.order.orderStableId ??
            params.order.id,
          deliveryProvider:
            params.provider === DeliveryProvider.UBER
              ? 'Uber'
              : String(params.provider),
          errorMessage: params.errorMessage,
          orderDetailUrl,
        });

      if (!result.ok) {
        this.logger.warn(
          `Delivery dispatch failure alert sms was not delivered. orderStableId=${params.order.orderStableId ?? 'null'}`,
        );
      }
    } catch (alertError: unknown) {
      const message =
        alertError instanceof Error
          ? alertError.message
          : 'unknown error while sending dispatch failure alert';
      this.logger.error(
        `Failed to send delivery dispatch failure alert: ${message}`,
      );
    }
  }
}
