// apps/api/src/orders/orders.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AppLogger } from '../common/app-logger';
import {
  DeliveryProvider,
  DeliveryType,
  MenuItemOptionGroup,
  MenuOptionGroupTemplate,
  MenuOptionTemplateChoice,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipService } from '../membership/membership.service';
import { CreateOrderDto, DeliveryDestinationDto } from './dto/create-order.dto';
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
  UberDirectService,
} from '../deliveries/uber-direct.service';
import {
  DoorDashDeliveryResult,
  DoorDashDriveService,
} from '../deliveries/doordash-drive.service';
import { parseHostedCheckoutMetadata } from '../clover/hco-metadata';
import {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';
import { isAvailableNow } from '@shared/menu';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
type OrderItemInput = NonNullable<CreateOrderDto['items']>[number] & {
  productId?: string;
  productStableId?: string;
  qty: number;
  options?: Record<string, unknown>;
};
type MenuItemWithOptions = Prisma.MenuItemGetPayload<{
  include: {
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
const REDEEM_DOLLAR_PER_POINT = parseNumberEnv(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT,
  1,
);

// 读取店铺坐标（方案 B 核心依赖）
const STORE_LATITUDE = Number(process.env.STORE_LATITUDE);
const STORE_LONGITUDE = Number(process.env.STORE_LONGITUDE);

// --- 常量定义 ---
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (value: string | null | undefined): boolean =>
  typeof value === 'string' && UUID_REGEX.test(value);

type DeliveryPricingConfig = {
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  salesTaxRate: number;
};

@Injectable()
export class OrdersService {
  private readonly logger = new AppLogger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly membership: MembershipService,
    private readonly uberDirect: UberDirectService,
    private readonly doorDashDrive: DoorDashDriveService,
  ) {
    // 启动时检查坐标配置，方便排查问题
    if (!Number.isFinite(STORE_LATITUDE) || !Number.isFinite(STORE_LONGITUDE)) {
      this.logger.warn(
        'STORE_LATITUDE or STORE_LONGITUDE is missing or invalid. Dynamic delivery fee calculation will fail and fallback to fixed rates.',
      );
    }
  }

  private async getBusinessPricingConfig(): Promise<DeliveryPricingConfig> {
    const existing =
      (await this.prisma.businessConfig.findUnique({
        where: { id: 1 },
      })) ??
      (await this.prisma.businessConfig.create({
        data: {
          id: 1,
          storeName: null,
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          deliveryBaseFeeCents: DEFAULT_DELIVERY_BASE_FEE_CENTS,
          priorityPerKmCents: DEFAULT_PRIORITY_PER_KM_CENTS,
          salesTaxRate: DEFAULT_TAX_RATE,
        },
      }));

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

    return {
      deliveryBaseFeeCents,
      priorityPerKmCents,
      salesTaxRate,
    };
  }

  private buildDeliveryFallback(
    pricingConfig: DeliveryPricingConfig,
  ): Record<
    DeliveryType,
    { provider: DeliveryProvider; feeCents: number; etaRange: [number, number] }
  > {
    const DEFAULT_PRIORITY_DISTANCE_KM = 6;

    return {
      [DeliveryType.STANDARD]: {
        provider: DeliveryProvider.DOORDASH,
        feeCents: pricingConfig.deliveryBaseFeeCents,
        etaRange: [45, 60],
      },
      [DeliveryType.PRIORITY]: {
        provider: DeliveryProvider.UBER,
        feeCents:
          pricingConfig.deliveryBaseFeeCents +
          Math.ceil(DEFAULT_PRIORITY_DISTANCE_KM) *
            pricingConfig.priorityPerKmCents,
        etaRange: [25, 35],
      },
    };
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
    const MAX_RANGE_KM = 10;

    if (distanceKm > MAX_RANGE_KM) {
      this.logger.warn(
        `Order rejected: distance ${distanceKm.toFixed(
          2,
        )}km exceeds limit of ${MAX_RANGE_KM}km.`,
      );
      throw new BadRequestException(
        `Delivery is not available for this address (exceeds ${MAX_RANGE_KM}km limit).`,
      );
    }

    // 2. Standard: 固定 $6 (600 cents)
    if (type === DeliveryType.STANDARD) {
      return pricingConfig.deliveryBaseFeeCents;
    }

    // 3. Priority: 基础费 + 每公里费 (向上取整)
    const baseCents = pricingConfig.deliveryBaseFeeCents;
    const perKmCents = pricingConfig.priorityPerKmCents;

    // ⭐ 修改点：向上取整 (Ceil)
    // 0.1km -> 1km, 1.2km -> 2km
    const chargedKm = Math.ceil(distanceKm);

    // 费用 = 基础费 + (计费里程 * 每公里费率)
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

  private collectOptionIds(options?: Record<string, unknown>): string[] {
    if (!options || typeof options !== 'object') return [];

    const ids: string[] = [];
    Object.values(options).forEach((val) => {
      if (typeof val === 'string') {
        ids.push(val);
      } else if (Array.isArray(val)) {
        val.forEach((v) => {
          if (typeof v === 'string') ids.push(v);
        });
      }
    });
    return ids;
  }

  /**
   * 🛡️ 安全核心：服务端重算商品价格
   */
  private async calculateLineItems(itemsDto: OrderItemInput[]): Promise<{
    calculatedItems: Prisma.OrderItemCreateWithoutOrderInput[];
    calculatedSubtotal: number;
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

    for (const product of dbProducts) {
      productMap.set(product.id, product);
      productMap.set(product.stableId, product);

      const optionLookup = new Map<string, OptionChoiceContext>();

      for (const link of product.optionGroups ?? []) {
        if (!link.isEnabled || !link.templateGroup) continue;
        const templateGroup = link.templateGroup;
        if (
          (templateGroup as { deletedAt?: Date | null }).deletedAt ||
          !isAvailableNow(
            availabilityFromDb(
              templateGroup.isAvailable,
              templateGroup.tempUnavailableUntil,
            ),
          )
        )
          continue;

        const choices = (templateGroup.options ?? []).filter((opt) => {
          const deleted = (opt as { deletedAt?: Date | null }).deletedAt;
          return (
            !deleted &&
            isAvailableNow(
              availabilityFromDb(opt.isAvailable, opt.tempUnavailableUntil),
            )
          );
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

      choiceLookupByProductId.set(product.id, optionLookup);
      choiceLookupByProductId.set(product.stableId, optionLookup);
    }

    let calculatedSubtotal = 0;
    const calculatedItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];

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
      if (!product.isVisible || !isAvailableNow(productAvailability)) {
        throw new BadRequestException(
          `Product not available: ${itemDto.normalizedProductId}`,
        );
      }

      const optionLookup =
        choiceLookupByProductId.get(itemDto.normalizedProductId) ??
        new Map<string, OptionChoiceContext>();
      let unitPriceCents = product.basePriceCents;

      const selectedOptionIds = Array.from(
        new Set(this.collectOptionIds(itemDto.options)),
      );

      const optionGroupSnapshots = new Map<
        string,
        OrderItemOptionGroupSnapshot
      >();

      for (const optionId of selectedOptionIds) {
        const context = optionLookup.get(optionId);
        if (!context) {
          throw new BadRequestException(
            `Option not found or unavailable: ${optionId} for product ${itemDto.normalizedProductId}`,
          );
        }

        unitPriceCents += context.choice.priceDeltaCents;
        const templateGroupStableId = context.group.stableId;

        const groupSnapshot =
          optionGroupSnapshots.get(templateGroupStableId) ??
          ({
            templateGroupStableId,
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
            choices: [] as OrderItemOptionChoiceSnapshot[],
          } satisfies OrderItemOptionGroupSnapshot);

        groupSnapshot.choices.push({
          stableId: context.choice.stableId,
          templateGroupStableId,
          nameEn: context.choice.nameEn,
          nameZh: context.choice.nameZh ?? null,
          priceDeltaCents: context.choice.priceDeltaCents,
          sortOrder: context.choice.sortOrder ?? 0,
        });

        optionGroupSnapshots.set(templateGroupStableId, groupSnapshot);
      }

      const optionsSnapshot: OrderItemOptionsSnapshot = Array.from(
        optionGroupSnapshots.values(),
      )
        .map((group) => ({
          ...group,
          choices: [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const lineTotal = unitPriceCents * itemDto.qty;
      calculatedSubtotal += lineTotal;

      const displayName =
        product.nameEn || product.nameZh || itemDto.displayName || 'Unknown';

      calculatedItems.push({
        productStableId: itemDto.normalizedProductId,
        qty: itemDto.qty,
        displayName,
        nameEn: product.nameEn,
        nameZh: product.nameZh,
        unitPriceCents,
        optionsJson: optionsSnapshot.length
          ? (optionsSnapshot as Prisma.InputJsonValue)
          : undefined,
      });
    }

    return { calculatedItems, calculatedSubtotal };
  }

  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
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
    const bodyKey =
      typeof dto.clientRequestId === 'string'
        ? dto.clientRequestId.trim()
        : undefined;
    const normalizedBodyKey = normalizeStableId(bodyKey);
    const stableKey = normalizedHeaderKey ?? normalizedBodyKey ?? bodyKey;

    if (stableKey) {
      const existing = await this.prisma.order.findUnique({
        where: { clientRequestId: stableKey },
        include: { items: true },
      });
      if (existing) return existing as OrderWithItems;
    }

    // —— Step 1: 服务端重算商品小计 (Security)
    // CreateOrderDto['items'] 允许 undefined, 我们转成空数组处理
    const items = dto.items ?? [];
    const { calculatedItems, calculatedSubtotal } =
      await this.calculateLineItems(items);

    const subtotalCents = calculatedSubtotal;
    const pricingConfig = await this.getBusinessPricingConfig();
    const deliveryRulesFallback = this.buildDeliveryFallback(pricingConfig);

    const requestedPoints =
      typeof dto.pointsToRedeem === 'number'
        ? dto.pointsToRedeem
        : typeof dto.redeemValueCents === 'number' &&
            REDEEM_DOLLAR_PER_POINT > 0
          ? dto.redeemValueCents / (REDEEM_DOLLAR_PER_POINT * 100)
          : undefined;

    // —— Step 2: 配送费与税费 (动态计算 & 距离复验)
    const isDelivery =
      dto.fulfillmentType === 'delivery' ||
      dto.deliveryType === DeliveryType.STANDARD ||
      dto.deliveryType === DeliveryType.PRIORITY;

    let deliveryFeeCustomerCents = 0;
    const deliveryMeta = dto.deliveryType
      ? deliveryRulesFallback[dto.deliveryType]
      : undefined;

    if (isDelivery) {
      const targetType = dto.deliveryType ?? DeliveryType.STANDARD;
      const dest = dto.deliveryDestination;

      // 只有当 店铺坐标 和 客户坐标 都存在时，才能动态计算
      if (
        Number.isFinite(STORE_LATITUDE) &&
        Number.isFinite(STORE_LONGITUDE) &&
        dest &&
        typeof dest.latitude === 'number' &&
        typeof dest.longitude === 'number'
      ) {
        // 1. 计算距离
        const distKm = this.calculateDistanceKm(
          STORE_LATITUDE,
          STORE_LONGITUDE,
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
          `Cannot calculate dynamic delivery fee (missing coords). Store: [${STORE_LATITUDE},${STORE_LONGITUDE}], Dest: [${dest?.latitude},${dest?.longitude}]. Falling back to fixed/frontend fee.`,
        );

        if (deliveryMeta) {
          deliveryFeeCustomerCents = deliveryMeta.feeCents;
        } else if (typeof dto.deliveryFeeCents === 'number') {
          deliveryFeeCustomerCents = dto.deliveryFeeCents;
        }
      }
    }

    // —— Step 3: 准备入库
    const pickupCode =
      dto.pickupCode?.trim() ||
      this.derivePickupCode(stableKey) ||
      (1000 + Math.floor(Math.random() * 9000)).toString();

    const contactName =
      dto.contactName?.trim() || dto.deliveryDestination?.name?.trim() || null;
    const contactPhone =
      dto.contactPhone?.trim() ||
      dto.deliveryDestination?.phone?.trim() ||
      null;

    const orderId = crypto.randomUUID();

    let order: OrderWithItems = await this.prisma.$transaction(async (tx) => {
      const couponInfo = await this.membership.validateCouponForOrder(
        {
          userId: dto.userId,
          couponId: dto.couponId,
          subtotalCents,
        },
        { tx },
      );

      const couponDiscountCents = couponInfo?.discountCents ?? 0;
      const subtotalAfterCoupon = Math.max(
        0,
        subtotalCents - couponDiscountCents,
      );

      const redeemValueCents = await this.loyalty.reserveRedeemForOrder({
        tx,
        userId: dto.userId,
        orderId,
        requestedPoints,
        subtotalAfterCoupon,
      });

      // 税基计算：(小计 - 优惠券 - 积分) + 配送费
      const purchaseBaseCents = Math.max(
        0,
        subtotalAfterCoupon - redeemValueCents,
      );
      const taxableCents =
        purchaseBaseCents + (isDelivery ? deliveryFeeCustomerCents : 0);
      const taxCents = Math.round(taxableCents * pricingConfig.salesTaxRate);

      const totalCents =
        purchaseBaseCents + deliveryFeeCustomerCents + taxCents;

      const loyaltyRedeemCents = redeemValueCents;
      const subtotalAfterDiscountCents = Math.max(
        0,
        subtotalCents - couponDiscountCents - loyaltyRedeemCents,
      );

      const created = (await tx.order.create({
        data: {
          id: orderId,
          userId: dto.userId ?? null,
          ...(stableKey ? { clientRequestId: stableKey } : {}),
          channel: dto.channel,
          fulfillmentType: dto.fulfillmentType,
          contactName,
          contactPhone,
          // 金额字段
          subtotalCents,
          taxCents,
          totalCents,
          deliveryFeeCents: deliveryFeeCustomerCents, // ⭐ 写入服务端计算的配送费
          pickupCode,
          couponId: couponInfo?.coupon?.id ?? null,
          couponDiscountCents,
          couponCodeSnapshot: couponInfo?.coupon?.code,
          couponTitleSnapshot: couponInfo?.coupon?.title,
          couponMinSpendCents: couponInfo?.coupon?.minSpendCents,
          couponExpiresAt: couponInfo?.coupon?.expiresAt,
          loyaltyRedeemCents,
          subtotalAfterDiscountCents,
          ...(deliveryMeta
            ? {
                deliveryType: dto.deliveryType,
                deliveryProvider: deliveryMeta.provider, // Provider 还是取自默认规则
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
          userId: dto.userId,
          couponId: couponInfo.coupon.id,
          subtotalCents,
          orderId,
        });
      }

      return created;
    });

    this.logger.log(
      `${this.formatOrderLogContext({
        orderId: order.id,
        clientRequestId: order.clientRequestId ?? null,
      })}Order created successfully (Server-side price calculated).`,
    );

    // === 派送逻辑 (DoorDash / Uber) ===
    const isStandard = dto.deliveryType === DeliveryType.STANDARD;
    const isPriority = dto.deliveryType === DeliveryType.PRIORITY;
    const dest = dto.deliveryDestination;

    if (dest && (isStandard || isPriority)) {
      const dropoff = this.normalizeDropoff(dest);
      const doordashEnabled = process.env.DOORDASH_DRIVE_ENABLED === '1';
      const uberEnabled = process.env.UBER_DIRECT_ENABLED === '1';

      try {
        if (isStandard && doordashEnabled) {
          order = await this.dispatchStandardDeliveryWithDoorDash(
            order,
            dropoff,
          );
        } else if (isPriority && uberEnabled) {
          order = await this.dispatchPriorityDelivery(order, dropoff);
        }
      } catch (error: unknown) {
        let message = 'unknown';
        if (error instanceof Error) {
          message = error.message;
        } else if (typeof error === 'string') {
          message = error;
        } else {
          try {
            message = JSON.stringify(error);
          } catch {
            message = '[unserializable error]';
          }
        }
        this.logger.error(`Failed to dispatch delivery: ${message}`);
      }
    }

    return order;
  }

  // ... (保留原有的 createLoyaltyOnlyOrder, createImmediatePaid, recent, board, getById, getPublicOrderSummary 等辅助方法，逻辑不变)

  async createLoyaltyOnlyOrder(payload: unknown): Promise<OrderWithItems> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('invalid payload');
    }

    // 定义 payload 类型以避免 unsafe access
    interface LoyaltyOrderPayload {
      amountCents?: unknown;
      referenceId?: unknown;
      metadata?: unknown;
    }
    const safePayload = payload as LoyaltyOrderPayload;

    const { metadata } = safePayload;
    if (metadata == null) throw new BadRequestException('metadata is required');

    const meta = parseHostedCheckoutMetadata(metadata);
    const loyaltyRedeemCents = meta.loyaltyRedeemCents ?? 0;
    const loyaltyUserId = meta.loyaltyUserId;

    if (!loyaltyUserId || loyaltyRedeemCents <= 0) {
      throw new BadRequestException(
        'loyaltyUserId and positive loyaltyRedeemCents required',
      );
    }

    let deliveryDestination: DeliveryDestinationDto | undefined;
    if (meta.fulfillment === 'delivery') {
      const { customer } = meta;
      if (
        !customer.addressLine1 ||
        !customer.city ||
        !customer.province ||
        !customer.postalCode
      ) {
        throw new BadRequestException('Delivery address incomplete');
      }
      deliveryDestination = {
        name: customer.name,
        phone: customer.phone,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        province: customer.province,
        postalCode: customer.postalCode,
        country: customer.country ?? 'Canada',
        instructions: customer.notes,
        // 这里没有 latitude/longitude，无法进行动态运费计算，
        // 但既然是 Clover 回调创建的订单，说明钱已经付了，
        // 这里只能信任 meta.deliveryFeeCents
        latitude: undefined,
        longitude: undefined,
        tipCents: undefined,
        notes: undefined,
        company: undefined,
      };
    }

    const dto: CreateOrderDto = {
      userId: loyaltyUserId,
      clientRequestId:
        typeof safePayload.referenceId === 'string'
          ? safePayload.referenceId
          : undefined,
      channel: 'web',
      fulfillmentType: meta.fulfillment,
      deliveryType: meta.deliveryType,
      deliveryDestination,
      items: meta.items.map((item) => ({
        productStableId: item.productStableId,
        qty: item.quantity,
      })),
      redeemValueCents: loyaltyRedeemCents,
      // 对于纯积分订单，信任 Clover 传回来的配送费（因为已经付过了）
      deliveryFeeCents: meta.deliveryFeeCents,
    };

    return this.createImmediatePaid(dto, dto.clientRequestId);
  }

  async createImmediatePaid(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const created = await this.create(dto, idempotencyKey);
    if (created.status === 'paid') return created;
    return this.updateStatus(created.id, 'paid');
  }

  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  async board(params: {
    statusIn?: OrderStatus[];
    channelIn?: Array<'web' | 'in_store' | 'ubereats'>;
    limit?: number;
    sinceMinutes?: number;
  }): Promise<OrderWithItems[]> {
    const { statusIn, channelIn, limit = 50, sinceMinutes = 24 * 60 } = params;
    const where: Prisma.OrderWhereInput = {};
    if (statusIn && statusIn.length > 0) where.status = { in: statusIn };
    if (channelIn && channelIn.length > 0) where.channel = { in: channelIn };
    if (sinceMinutes > 0) {
      const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
      where.createdAt = { gte: since };
    }
    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    }) as Promise<OrderWithItems[]>;
  }

  async getById(id: string): Promise<OrderWithItems> {
    const order = (await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })) as OrderWithItems | null;
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async getPublicOrderSummary(orderParam: string): Promise<OrderSummaryDto> {
    const value = (orderParam ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    const include = { items: true as const };
    let order: OrderWithItems | null = null;
    if (isUuid(value)) {
      order = (await this.prisma.order.findUnique({
        where: { id: value },
        include,
      })) as OrderWithItems | null;
    }
    if (!order) {
      order = (await this.prisma.order.findFirst({
        where: { clientRequestId: value },
        include,
      })) as OrderWithItems | null;
    }
    if (!order) {
      const intent = await this.prisma.checkoutIntent.findFirst({
        where: {
          OR: [{ referenceId: value }, { checkoutSessionId: value }],
          orderId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { orderId: true },
      });
      if (intent?.orderId) {
        order = (await this.prisma.order.findUnique({
          where: { id: intent.orderId },
          include,
        })) as OrderWithItems | null;
      }
    }
    if (!order) throw new NotFoundException('order not found');

    const safeOrder = order;

    const subtotalCents = safeOrder.subtotalCents ?? 0;
    const taxCents = safeOrder.taxCents ?? 0;
    const deliveryFeeCents = safeOrder.deliveryFeeCents ?? 0;
    const discountCents =
      (safeOrder.loyaltyRedeemCents ?? 0) +
      (safeOrder.couponDiscountCents ?? 0);

    const lineItems = safeOrder.items.map((item) => {
      const optionsSnapshot = item.optionsJson as
        | OrderItemOptionsSnapshot
        | null
        | undefined;
      const unitPriceCents = item.unitPriceCents ?? 0;
      const quantity = item.qty;
      const totalPriceCents = unitPriceCents * quantity;
      const display =
        item.displayName || item.nameEn || item.nameZh || item.productStableId;
      return {
        productStableId: item.productStableId,
        name: display,
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        quantity,
        unitPriceCents,
        totalPriceCents,
        optionsJson: optionsSnapshot ?? undefined,
        loyaltyRedeemCents: safeOrder.loyaltyRedeemCents ?? null,
        couponDiscountCents: safeOrder.couponDiscountCents ?? null,
        subtotalAfterDiscountCents:
          safeOrder.subtotalAfterDiscountCents ?? null,
      };
    });

    return {
      orderId: safeOrder.id,
      clientRequestId: safeOrder.clientRequestId,
      orderNumber: safeOrder.clientRequestId ?? safeOrder.id,
      currency: 'CAD',
      subtotalCents,
      taxCents,
      deliveryFeeCents,
      discountCents,
      totalCents: safeOrder.totalCents,
      lineItems,
    };
  }

  async updateStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('order not found');
    if (!ORDER_STATUS_TRANSITIONS[current.status].includes(next)) {
      throw new BadRequestException(
        `illegal transition ${current.status} -> ${next}`,
      );
    }
    const updated = (await this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    })) as OrderWithItems & { loyaltyRedeemCents: number };

    if (next === 'paid') {
      const netSubtotalForRewards = Math.max(
        0,
        (updated.subtotalCents ?? 0) - (updated.couponDiscountCents ?? 0),
      );
      if (updated.couponId) {
        void this.membership.markCouponUsedForOrder({
          couponId: updated.couponId,
          orderId: updated.id,
        });
      }
      void this.loyalty.settleOnPaid({
        orderId: updated.id,
        userId: updated.userId ?? undefined,
        subtotalCents: netSubtotalForRewards,
        redeemValueCents: updated.loyaltyRedeemCents ?? 0,
      });
    } else if (next === 'refunded') {
      if (updated.couponId) {
        void this.membership.releaseCouponForOrder({
          orderId: updated.id,
          couponId: updated.couponId,
        });
      }
      void this.loyalty.rollbackOnRefund(updated.id);
    }
    return updated;
  }

  async advance(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('order not found');
    const next = ORDER_STATUS_ADVANCE_FLOW[order.status];
    if (!next)
      return (await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      })) as OrderWithItems;
    return this.updateStatus(id, next);
  }

  private normalizeDropoff(
    destination: DeliveryDestinationDto,
  ): UberDirectDropoffDetails {
    const sanitize = (value?: string | null): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };
    return {
      name: sanitize(destination.name) ?? destination.name,
      phone: sanitize(destination.phone) ?? destination.phone,
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

  private formatOrderLogContext(params?: {
    orderId?: string | null;
    clientRequestId?: string | null;
  }): string {
    const parts: string[] = [];
    if (params?.orderId) parts.push(`orderId=${params.orderId}`);
    if (params?.clientRequestId)
      parts.push(`clientRequestId=${params.clientRequestId}`);
    return parts.length ? `[${parts.join(' ')}] ` : '';
  }

  private async dispatchStandardDeliveryWithDoorDash(
    order: OrderWithItems,
    destination: UberDirectDropoffDetails,
  ): Promise<OrderWithItems> {
    const response: DoorDashDeliveryResult =
      await this.doorDashDrive.createDelivery({
        orderId: order.id,
        pickupCode: order.pickupCode ?? undefined,
        reference: order.clientRequestId ?? undefined,
        totalCents: order.totalCents,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
      });
    const updateData: Prisma.OrderUpdateInput = {
      externalDeliveryId: response.deliveryId,
    };
    if (typeof response.deliveryCostCents === 'number') {
      updateData.deliveryCostCents = Math.round(response.deliveryCostCents);
    }
    return this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: { items: true },
    }) as Promise<OrderWithItems>;
  }

  private async dispatchPriorityDelivery(
    order: OrderWithItems,
    destination: UberDirectDropoffDetails,
  ): Promise<OrderWithItems> {
    const response: UberDirectDeliveryResult =
      await this.uberDirect.createDelivery({
        orderId: order.id,
        pickupCode: order.pickupCode,
        reference: order.clientRequestId,
        totalCents: order.totalCents,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
      });
    const updateData: Prisma.OrderUpdateInput = {
      externalDeliveryId: response.deliveryId,
    };
    if (typeof response.deliveryCostCents === 'number') {
      updateData.deliveryCostCents = Math.round(response.deliveryCostCents);
    }
    return this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: { items: true },
    }) as Promise<OrderWithItems>;
  }
}
