// apps/api/src/orders/orders.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import * as crypto from 'crypto';
import { AppLogger } from '../common/app-logger';
import { normalizeEmail } from '../common/utils/email';
import {
  BusinessConfig,
  Channel,
  DeliveryProvider,
  DeliveryType,
  FulfillmentType,
  LoyaltyEntryType,
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
import { MembershipService } from '../membership/membership.service';
import { CreateOrderInput, DeliveryDestinationInput } from '@shared/order';
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
  DoorDashDeliveryResult,
  DoorDashDriveService,
} from '../deliveries/doordash-drive.service';
import {
  buildClientRequestId,
  CLIENT_REQUEST_ID_RE,
} from '../common/utils/client-request-id';
import {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';
import { isAvailableNow } from '@shared/menu';
import {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from '../common/daily-specials';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notifications/notification.service';
import { EmailService } from '../email/email.service';
import type { OrderDto, OrderItemDto } from './dto/order.dto';
import type { PrintPosPayloadDto } from '../pos/dto/print-pos-payload.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;
type OrderItemSnapshot = Prisma.OrderItemGetPayload<{
  select: {
    productStableId: true;
    qty: true;
    displayName: true;
    nameEn: true;
    nameZh: true;
    unitPriceCents: true;
    optionsJson: true;
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
  contactName: true,
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
  couponCodeSnapshot: true,
  couponTitleSnapshot: true,
  couponDiscountCents: true,
  loyaltyRedeemCents: true,
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
      optionsJson: true,
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
const DEFAULT_MAX_RANGE_KM = 10;
const DEFAULT_PRIORITY_DISTANCE_KM = 6;
const DEFAULT_REDEEM_DOLLAR_PER_POINT = 1;

type DeliveryPricingConfig = {
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  salesTaxRate: number;
  maxDeliveryRangeKm: number;
  priorityDefaultDistanceKm: number;
  storeLatitude: number | null;
  storeLongitude: number | null;
  redeemDollarPerPoint: number;
  enableDoorDash: boolean;
  enableUberDirect: boolean;
};

@Injectable()
export class OrdersService {
  private readonly logger = new AppLogger(OrdersService.name);
  private readonly CLIENT_REQUEST_ID_RE = CLIENT_REQUEST_ID_RE;
  private readonly snsClient = new SNSClient({
    region: process.env.AWS_REGION,
  });
  private readonly snsTopicArn = process.env.SNS_TOPIC_ARN;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly membership: MembershipService,
    private readonly uberDirect: UberDirectService,
    private readonly doorDashDrive: DoorDashDriveService,
    private readonly locationService: LocationService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) {}

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
    const items: OrderItemDto[] = rawItems.map((it) => ({
      productStableId: it.productStableId,
      qty: it.qty,
      displayName:
        it.displayName || it.nameEn || it.nameZh || it.productStableId,
      nameEn: it.nameEn ?? null,
      nameZh: it.nameZh ?? null,
      unitPriceCents: it.unitPriceCents ?? 0,
      optionsJson: it.optionsJson ?? undefined,
    }));

    return {
      orderStableId,
      orderNumber,
      clientRequestId: order.clientRequestId ?? null,

      status: order.status,
      channel: order.channel,
      fulfillmentType: order.fulfillmentType,

      paymentMethod: order.paymentMethod ?? null,

      pickupCode: order.pickupCode ?? null,

      contactName: order.contactName ?? null,
      contactPhone: order.contactPhone ?? null,

      deliveryType: order.deliveryType ?? null,
      deliveryProvider: order.deliveryProvider ?? null,
      deliveryEtaMinMinutes: order.deliveryEtaMinMinutes ?? null,
      deliveryEtaMaxMinutes: order.deliveryEtaMaxMinutes ?? null,

      subtotalCents: order.subtotalCents ?? 0,
      taxCents: order.taxCents ?? 0,
      deliveryFeeCents: order.deliveryFeeCents ?? 0,
      deliveryCostCents,
      deliverySubsidyCents,
      totalCents: order.totalCents ?? 0,

      couponCodeSnapshot: order.couponCodeSnapshot ?? null,
      couponTitleSnapshot: order.couponTitleSnapshot ?? null,
      couponDiscountCents: order.couponDiscountCents ?? 0,

      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,

      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,

      items,
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

  // ✅ 第三方 webhook/internal：如你确实需要用 DoorDash/Uber 回调的 orderId 来反查
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

    // —— 积分结算与优惠券处理
    if (next === 'paid') {
      // [优化]：使用公共方法，逻辑统一
      void this.handleOrderPaidSideEffects(updated);
    } else if (next === 'refunded') {
      void this.loyalty.rollbackOnRefund(updated.id);
    } else if (next === 'ready') {
      void this.notifyOrderReady(updated);
    }
    return updated;
  }

  private async notifyOrderReady(order: OrderWithItems) {
    if (!order.contactPhone) return;
    const orderNumber = order.clientRequestId ?? order.orderStableId;
    if (!orderNumber) return;
    await this.notificationService.notifyOrderReady({
      phone: order.contactPhone,
      orderNumber,
      name: order.contactName ?? null,
    });
  }

  private async handleOrderPaidSideEffects(order: OrderWithItems) {
    // 1. 计算用于积分奖励的有效金额（小计 - 优惠券折扣）
    const netSubtotalForRewards = Math.max(
      0,
      (order.subtotalCents ?? 0) - (order.couponDiscountCents ?? 0),
    );

    // 2. 标记优惠券为已使用 (如果使用了优惠券)
    if (order.couponId) {
      // 使用 void 不阻塞主流程，但建议根据业务决定是否需要 await
      void this.membership.markCouponUsedForOrder({
        couponId: order.couponId,
        orderId: order.id,
      });
    }

    if (!this.snsTopicArn) {
      this.logger.warn(
        `SNS_TOPIC_ARN not configured, skipping ORDER_PAID publish for order ${order.id}`,
      );
      return;
    }

    try {
      await this.snsClient.send(
        new PublishCommand({
          TopicArn: this.snsTopicArn,
          Message: JSON.stringify({
            event: 'ORDER_PAID',
            orderId: order.id,
            userId: order.userId,
            amountCents: netSubtotalForRewards,
            redeemValueCents: order.loyaltyRedeemCents ?? 0,
            timestamp: new Date().toISOString(),
          }),
        }),
      );
      this.logger.log(`Published ORDER_PAID event for order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to publish SNS: ${String(error)}`);
    }
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
    if (dto.channel === Channel.ubereats) return PaymentMethod.CARD;

    // Channel.in_store 但没传：兜底现金，同时留日志方便你排查 POS 漏传
    this.logger.warn(
      'paymentMethod missing for in_store order; defaulting to CASH. Please send dto.paymentMethod from POS.',
    );
    return PaymentMethod.CASH;
  }

  private async ensureBusinessConfig(): Promise<BusinessConfig> {
    return (
      (await this.prisma.businessConfig.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.businessConfig.create({
        data: {
          id: 1,
          storeName: '',
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          deliveryBaseFeeCents: DEFAULT_DELIVERY_BASE_FEE_CENTS,
          priorityPerKmCents: DEFAULT_PRIORITY_PER_KM_CENTS,
          maxDeliveryRangeKm: DEFAULT_MAX_RANGE_KM,
          priorityDefaultDistanceKm: DEFAULT_PRIORITY_DISTANCE_KM,
          salesTaxRate: DEFAULT_TAX_RATE,
          redeemDollarPerPoint: DEFAULT_REDEEM_DOLLAR_PER_POINT,
        },
      }))
    );
  }

  private async getBusinessPricingConfig(): Promise<DeliveryPricingConfig> {
    const existing = await this.ensureBusinessConfig();

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
    const storeLatitude = Number.isFinite(existing.storeLatitude ?? NaN)
      ? (existing.storeLatitude as number)
      : null;
    const storeLongitude = Number.isFinite(existing.storeLongitude ?? NaN)
      ? (existing.storeLongitude as number)
      : null;
    const redeemDollarPerPoint =
      typeof existing.redeemDollarPerPoint === 'number' &&
      Number.isFinite(existing.redeemDollarPerPoint) &&
      existing.redeemDollarPerPoint > 0
        ? existing.redeemDollarPerPoint
        : DEFAULT_REDEEM_DOLLAR_PER_POINT;
    const enableDoorDash =
      typeof existing.enableDoorDash === 'boolean'
        ? existing.enableDoorDash
        : true;
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
      redeemDollarPerPoint,
      enableDoorDash,
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
        provider: DeliveryProvider.DOORDASH,
        feeCents: pricingConfig.deliveryBaseFeeCents,
        etaRange: [45, 60],
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

  private centsToRedeemMicro(
    cents: number,
    redeemDollarPerPoint: number,
  ): bigint {
    if (!Number.isFinite(cents) || cents <= 0) return 0n;
    if (!Number.isFinite(redeemDollarPerPoint) || redeemDollarPerPoint <= 0)
      return 0n;

    // cents -> dollars -> points -> microPoints（四舍五入）
    const pts = cents / 100 / redeemDollarPerPoint;
    const micro = Math.round(pts * 1_000_000); // 1 pt = 1e6 micro
    return BigInt(micro);
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
   * 方案B：在“创建 amendment 的同一个事务”里调用
   * - 计算：现金可退额度 vs 积分返还额度（考虑历史 amendments 已退）
   * - 写：OrderAmendment 的 refundCents / redeemReturnCents / redeemReturnMicro / earnAdjustMicro / referralAdjustMicro
   * - 写：LoyaltyLedger（用 sourceKey 幂等）并更新账户余额
   *
   * 注意：refundGrossCents 建议传“你本次退菜对应的应退价值（分）”，不要包含小费。
   */
  private async applyLoyaltyAdjustmentsForAmendmentTx(params: {
    tx: Prisma.TransactionClient;
    orderId: string;
    amendmentId: string;
    amendmentStableId: string;
    refundGrossCents: number;
  }): Promise<void> {
    const { tx, orderId, amendmentId, amendmentStableId } = params;
    const refundGrossCentsRaw = Number.isFinite(params.refundGrossCents)
      ? Math.max(0, Math.round(params.refundGrossCents))
      : 0;
    const pricingConfig = await this.getBusinessPricingConfig();

    // 1) 读订单（需要：userId / totalCents / loyaltyRedeemCents / subtotalCents）
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        subtotalCents: true,
        totalCents: true,
        loyaltyRedeemCents: true,
      },
    });

    if (!order?.userId) {
      // 匿名单：不处理积分；但仍可把 refundCents 写回 amendment（按现金退）
      await tx.orderAmendment.update({
        where: { id: amendmentId },
        data: {
          refundCents: refundGrossCentsRaw,
          redeemReturnCents: 0,
          redeemReturnMicro: 0n,
          earnAdjustMicro: 0n,
          referralAdjustMicro: 0n,
        },
      });
      return;
    }

    const originalCashPaidCents = Math.max(0, order.totalCents ?? 0);
    const originalRedeemCents = Math.max(0, order.loyaltyRedeemCents ?? 0);

    // 2) 汇总历史已退（现金/积分），避免超退
    const agg = await tx.orderAmendment.aggregate({
      where: { orderId },
      _sum: { refundCents: true, redeemReturnCents: true },
    });

    const refundedCashAlready = Math.max(0, agg._sum.refundCents ?? 0);
    const returnedRedeemAlready = Math.max(0, agg._sum.redeemReturnCents ?? 0);

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

    const refundGrossCents = Math.min(refundGrossCentsRaw, maxRefundableCents);

    // 3) 规则：先退现金（不超过 remainingCashRefundable），超出部分返还积分（不超过 remainingRedeemRefundable）
    const redeemReturnCents = Math.min(
      remainingRedeemRefundable,
      Math.max(0, refundGrossCents - remainingCashRefundable),
    );
    const refundCashCents = Math.max(0, refundGrossCents - redeemReturnCents);

    const sourceKey = `AMEND:${amendmentStableId}`;

    // 4) 锁定用户积分账户
    const acc = await this.ensureLoyaltyAccountWithTx(tx, order.userId);

    await tx.$queryRaw`
    SELECT id
    FROM "LoyaltyAccount"
    WHERE id = ${acc.id}::uuid
    FOR UPDATE
  `;

    let userBalance = acc.pointsMicro;

    // 5) 返还抵扣积分（redeemReturn）
    const redeemReturnMicro = this.centsToRedeemMicro(
      redeemReturnCents,
      pricingConfig.redeemDollarPerPoint,
    );

    if (redeemReturnMicro > 0n) {
      const existed = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
            sourceKey,
          },
        },
        select: { id: true, deltaMicro: true, balanceAfterMicro: true },
      });

      if (!existed) {
        const newBal = userBalance + redeemReturnMicro;
        await tx.loyaltyLedger.create({
          data: {
            accountId: acc.id,
            orderId,
            type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
            sourceKey,
            deltaMicro: redeemReturnMicro,
            balanceAfterMicro: newBal,
            note: `amend return redeem $${(redeemReturnCents / 100).toFixed(2)}`,
          },
        });
        userBalance = newBal;
      } else {
        userBalance = existed.balanceAfterMicro;
      }
    }

    // 6) 回收 earned（按比例，基于 netBase=subtotal-redeem；refund 口径用 refundCashCents）
    //    这里不把 coupon 纳入 net（与 settleOnPaid 现状一致）
    let earnAdjustMicroApplied = 0n;

    const netBaseCents = Math.max(
      0,
      (order.subtotalCents ?? 0) - (order.loyaltyRedeemCents ?? 0),
    );

    if (netBaseCents > 0 && refundCashCents > 0) {
      const earn = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.EARN_ON_PURCHASE,
            sourceKey: 'ORDER',
          },
        },
        select: { deltaMicro: true },
      });

      const earnedTotalMicro = earn?.deltaMicro ?? 0n;
      if (earnedTotalMicro > 0n) {
        const refundableBaseCents = Math.min(refundCashCents, netBaseCents);

        const proportionalMicro =
          (earnedTotalMicro * BigInt(refundableBaseCents)) /
          BigInt(netBaseCents);

        if (proportionalMicro > 0n) {
          const willDeduct =
            proportionalMicro > userBalance ? userBalance : proportionalMicro;

          const existedReverse = await tx.loyaltyLedger.findUnique({
            where: {
              orderId_type_sourceKey: {
                orderId,
                type: LoyaltyEntryType.REFUND_REVERSE_EARN,
                sourceKey,
              },
            },
            select: { id: true, deltaMicro: true, balanceAfterMicro: true },
          });

          if (!existedReverse) {
            const newBal = userBalance - willDeduct;
            await tx.loyaltyLedger.create({
              data: {
                accountId: acc.id,
                orderId,
                type: LoyaltyEntryType.REFUND_REVERSE_EARN,
                sourceKey,
                deltaMicro: -willDeduct,
                balanceAfterMicro: newBal,
                note: `amend reverse earn on $${(
                  refundableBaseCents / 100
                ).toFixed(2)}`,
              },
            });
            userBalance = newBal;
            earnAdjustMicroApplied = -willDeduct;
          } else {
            earnAdjustMicroApplied = existedReverse.deltaMicro ?? 0n;
            userBalance = existedReverse.balanceAfterMicro;
          }
        }
      }
    }

    // 7) 回收 referral（若存在，按同一比例；扣推荐人账户）
    let referralAdjustMicroApplied = 0n;

    if (netBaseCents > 0 && refundCashCents > 0) {
      const referral = await tx.loyaltyLedger.findUnique({
        where: {
          orderId_type_sourceKey: {
            orderId,
            type: LoyaltyEntryType.REFERRAL_BONUS,
            sourceKey: 'ORDER',
          },
        },
        select: { accountId: true, deltaMicro: true },
      });

      const referralTotalMicro = referral?.deltaMicro ?? 0n;

      if (referral && referralTotalMicro > 0n) {
        const refundableBaseCents = Math.min(refundCashCents, netBaseCents);

        const proportionalMicro =
          (referralTotalMicro * BigInt(refundableBaseCents)) /
          BigInt(netBaseCents);

        if (proportionalMicro > 0n) {
          const existedReverse = await tx.loyaltyLedger.findUnique({
            where: {
              orderId_type_sourceKey: {
                orderId,
                type: LoyaltyEntryType.REFUND_REVERSE_REFERRAL,
                sourceKey,
              },
            },
            select: { id: true, deltaMicro: true },
          });

          if (!existedReverse) {
            const refAcc = await tx.loyaltyAccount.findUnique({
              where: { id: referral.accountId },
              select: { id: true, pointsMicro: true },
            });

            if (refAcc) {
              await tx.$queryRaw`
              SELECT id
              FROM "LoyaltyAccount"
              WHERE id = ${refAcc.id}::uuid
              FOR UPDATE
            `;

              const willDeduct =
                proportionalMicro > refAcc.pointsMicro
                  ? refAcc.pointsMicro
                  : proportionalMicro;

              const refNewBal = refAcc.pointsMicro - willDeduct;

              await tx.loyaltyLedger.create({
                data: {
                  accountId: refAcc.id,
                  orderId,
                  type: LoyaltyEntryType.REFUND_REVERSE_REFERRAL,
                  sourceKey,
                  deltaMicro: -willDeduct,
                  balanceAfterMicro: refNewBal,
                  note: `amend reverse referral on $${(
                    refundableBaseCents / 100
                  ).toFixed(2)}`,
                },
              });

              await tx.loyaltyAccount.update({
                where: { id: refAcc.id },
                data: { pointsMicro: refNewBal },
              });

              referralAdjustMicroApplied = -willDeduct;
            }
          } else {
            referralAdjustMicroApplied = existedReverse.deltaMicro ?? 0n;
          }
        }
      }
    }

    // 8) 回写用户账户余额
    await tx.loyaltyAccount.update({
      where: { id: acc.id },
      data: { pointsMicro: userBalance },
    });

    // 9) 回写 amendment（方案B字段）
    await tx.orderAmendment.update({
      where: { id: amendmentId },
      data: {
        refundCents: refundCashCents,
        redeemReturnCents,
        redeemReturnMicro,
        earnAdjustMicro: earnAdjustMicroApplied,
        referralAdjustMicro: referralAdjustMicroApplied,
      },
    });
  }

  /**
   * 🛡️ 安全核心：服务端重算商品价格
   */
  private async calculateLineItems(itemsDto: OrderItemInput[]): Promise<{
    calculatedItems: Prisma.OrderItemCreateWithoutOrderInput[];
    calculatedSubtotal: number;
    couponEligibleSubtotalCents: number;
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
        if ((templateGroup as { deletedAt?: Date | null }).deletedAt) continue;

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

    const businessConfig = await this.ensureBusinessConfig();
    const now = resolveStoreNow(businessConfig.timezone);
    const weekday = now.weekday;
    const productStableIds = dbProducts.map((product) => product.stableId);

    const rawDailySpecials =
      productStableIds.length === 0
        ? []
        : await this.prisma.menuDailySpecial.findMany({
            where: {
              weekday,
              isEnabled: true,
              deletedAt: null,
              itemStableId: { in: productStableIds },
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          });

    const activeSpecialsByItemStableId = new Map<
      string,
      (typeof rawDailySpecials)[number]
    >();
    rawDailySpecials.forEach((special) => {
      if (!isDailySpecialActiveNow(special, now)) return;
      if (!activeSpecialsByItemStableId.has(special.itemStableId)) {
        activeSpecialsByItemStableId.set(special.itemStableId, special);
      }
    });

    let calculatedSubtotal = 0;
    let couponEligibleSubtotalCents = 0;
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
      if (!isAvailableNow(productAvailability)) {
        throw new BadRequestException(
          `Product not available: ${itemDto.normalizedProductId}`,
        );
      }

      const optionLookup =
        choiceLookupByProductId.get(itemDto.normalizedProductId) ??
        new Map<string, OptionChoiceContext>();
      const activeSpecial =
        activeSpecialsByItemStableId.get(product.stableId) ?? null;
      const baseUnitPriceCents = activeSpecial
        ? resolveEffectivePriceCents(product.basePriceCents, activeSpecial)
        : product.basePriceCents;
      let optionsUnitPriceCents = 0;

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

        optionsUnitPriceCents += context.choice.priceDeltaCents;
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

      const unitPriceCents = baseUnitPriceCents + optionsUnitPriceCents;
      const lineTotal = unitPriceCents * itemDto.qty;
      calculatedSubtotal += lineTotal;
      if (!activeSpecial?.disallowCoupons) {
        couponEligibleSubtotalCents += lineTotal;
      }

      const displayName =
        product.nameEn || product.nameZh || itemDto.displayName || 'Unknown';

      calculatedItems.push({
        productStableId: itemDto.normalizedProductId,
        qty: itemDto.qty,
        displayName,
        nameEn: product.nameEn,
        nameZh: product.nameZh,
        unitPriceCents,
        baseUnitPriceCents,
        optionsUnitPriceCents,
        isDailySpecialApplied: Boolean(activeSpecial),
        dailySpecialStableId: activeSpecial?.stableId ?? null,
        optionsJson: optionsSnapshot.length
          ? (optionsSnapshot as Prisma.InputJsonValue)
          : undefined,
      });
    }

    return { calculatedItems, calculatedSubtotal, couponEligibleSubtotalCents };
  }

  async create(
    dto: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<OrderDto> {
    const order = await this.createInternal(dto, idempotencyKey);
    return this.toOrderDto(order);
  }

  async createInternal(
    dto: CreateOrderInput,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    // ✅ 你的业务前提：只在“已收款/支付成功”后才创建订单记录
    const paidAt = new Date();
    const paymentMethod = this.resolvePaymentMethod(dto);

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
    const { calculatedItems, calculatedSubtotal, couponEligibleSubtotalCents } =
      await this.calculateLineItems(items);
    const productStableIds = Array.from(
      new Set(calculatedItems.map((item) => item.productStableId)),
    );
    if (normalizedCouponStableId && couponEligibleSubtotalCents <= 0) {
      throw new BadRequestException(
        'coupon is not available for daily special items',
      );
    }

    const subtotalCents = calculatedSubtotal;
    const pricingConfig = await this.getBusinessPricingConfig();
    const deliveryRulesFallback = this.buildDeliveryFallback(pricingConfig);

    const requestedPoints =
      typeof dto.pointsToRedeem === 'number'
        ? dto.pointsToRedeem
        : typeof dto.redeemValueCents === 'number' &&
            pricingConfig.redeemDollarPerPoint > 0
          ? dto.redeemValueCents / (pricingConfig.redeemDollarPerPoint * 100)
          : undefined;

    // —— Step 2: 配送费与税费 (动态计算 & 距离复验)
    const isDelivery =
      dto.fulfillmentType === 'delivery' ||
      dto.deliveryType === DeliveryType.STANDARD ||
      dto.deliveryType === DeliveryType.PRIORITY;

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
      const targetType = dto.deliveryType ?? DeliveryType.STANDARD;
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
        } else if (typeof dto.deliveryFeeCents === 'number') {
          deliveryFeeCustomerCents = dto.deliveryFeeCents;
        }
      }
    }

    // —— Step 3: 准备入库
    const contactName =
      dto.contactName?.trim() || dto.deliveryDestination?.name?.trim() || null;
    const contactPhone =
      dto.contactPhone?.trim() ||
      dto.deliveryDestination?.phone?.trim() ||
      null;

    const orderId = crypto.randomUUID();
    const rawSelectedUserCouponId =
      typeof dto.selectedUserCouponId === 'string'
        ? dto.selectedUserCouponId.trim()
        : '';
    const selectedUserCouponId =
      rawSelectedUserCouponId.length > 0 ? rawSelectedUserCouponId : null;

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
            const hiddenItemStableIds = hiddenItems.map(
              (item) => item.stableId,
            );
            let userCouponToRedeem: {
              id: string;
              couponStableId: string;
              stackingPolicy: 'EXCLUSIVE' | 'STACKABLE';
              unlockedItemStableIds: string[];
            } | null = null;

            if (hiddenItemStableIds.length > 0) {
              if (!normalizedUserStableId) {
                throw new BadRequestException(
                  'userStableId is required for hidden items',
                );
              }
              if (!selectedUserCouponId) {
                throw new BadRequestException(
                  'selectedUserCouponId is required for hidden items',
                );
              }
              const userCoupon = await tx.userCoupon.findFirst({
                where: {
                  id: selectedUserCouponId,
                  userStableId: normalizedUserStableId,
                  status: 'AVAILABLE',
                  AND: [
                    {
                      OR: [{ expiresAt: null }, { expiresAt: { gt: paidAt } }],
                    },
                    {
                      coupon: {
                        isActive: true,
                        AND: [
                          {
                            OR: [
                              { startsAt: null },
                              { startsAt: { lte: paidAt } },
                            ],
                          },
                          {
                            OR: [{ endsAt: null }, { endsAt: { gt: paidAt } }],
                          },
                        ],
                      },
                    },
                  ],
                },
                include: { coupon: true },
              });
              if (!userCoupon) {
                throw new BadRequestException('coupon is not available');
              }

              const unlockedSet = new Set(
                (userCoupon.coupon.unlockedItemStableIds ?? []).map((value) =>
                  value.trim(),
                ),
              );
              const missing = hiddenItemStableIds.filter(
                (stableId) => !unlockedSet.has(stableId),
              );
              if (missing.length > 0) {
                throw new BadRequestException(
                  'hidden items are not unlocked by this coupon',
                );
              }

              if (
                userCoupon.coupon.stackingPolicy === 'EXCLUSIVE' &&
                normalizedCouponStableId
              ) {
                throw new BadRequestException(
                  'coupon cannot be stacked with other coupons',
                );
              }

              userCouponToRedeem = {
                id: userCoupon.id,
                couponStableId: userCoupon.couponStableId,
                stackingPolicy: userCoupon.coupon.stackingPolicy,
                unlockedItemStableIds:
                  userCoupon.coupon.unlockedItemStableIds ?? [],
              };
            }

            const couponInfo = await this.membership.validateCouponForOrder(
              {
                userId,
                couponStableId: normalizedCouponStableId ?? undefined,
                subtotalCents: couponEligibleSubtotalCents,
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
                sourceKey: 'ORDER',
              });
            }

            // 税基计算：(小计 - 优惠券 - 积分) + 配送费
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

            const loyaltyRedeemCents = redeemValueCents;
            const subtotalAfterDiscountCents = Math.max(
              0,
              subtotalCents - couponDiscountCents - loyaltyRedeemCents,
            );

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
                fulfillmentType: dto.fulfillmentType,
                contactName,
                contactPhone,
                // 金额字段
                subtotalCents,
                taxCents,
                totalCents,
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

            if (userCouponToRedeem) {
              const updatedCoupon = await tx.userCoupon.updateMany({
                where: {
                  id: userCouponToRedeem.id,
                  status: 'AVAILABLE',
                },
                data: {
                  status: 'REDEEMED',
                  redeemedAt: paidAt,
                  orderStableId: created.orderStableId,
                },
              });
              if (updatedCoupon.count === 0) {
                throw new BadRequestException('coupon is not available');
              }
              this.logger.log(
                `UserCoupon redeemed: userCouponId=${userCouponToRedeem.id} couponStableId=${userCouponToRedeem.couponStableId} orderStableId=${created.orderStableId}`,
              );
            }

            if (couponInfo?.coupon?.id) {
              await this.membership.reserveCouponForOrder({
                tx,
                userId,
                couponId: couponInfo.coupon.id,
                subtotalCents: couponEligibleSubtotalCents,
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

        // === 派送逻辑 (DoorDash / Uber) ===
        const isStandard = dto.deliveryType === DeliveryType.STANDARD;
        const isPriority = dto.deliveryType === DeliveryType.PRIORITY;
        const dest = dto.deliveryDestination;

        if (dest && (isStandard || isPriority)) {
          const dropoff = this.normalizeDropoff(dest);
          const doordashEnabled = pricingConfig.enableDoorDash;
          const uberEnabled = pricingConfig.enableUberDirect;

          try {
            if (isStandard && doordashEnabled) {
              return await this.dispatchStandardDeliveryWithDoorDash(
                order,
                dropoff,
              );
            }
            if (isPriority && uberEnabled) {
              const businessConfig = await this.ensureBusinessConfig();
              const pickup = this.buildUberPickupOverride(businessConfig);
              return await this.dispatchPriorityDelivery(
                order,
                dropoff,
                pickup,
              );
            }
          } catch (error: unknown) {
            let message = 'unknown';
            if (error instanceof Error) message = error.message;
            else if (typeof error === 'string') message = error;
            else {
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
        ? (deliveryType ?? DeliveryType.STANDARD)
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

  async recent(limit = 10): Promise<OrderDto[]> {
    const orders = (await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })) as OrderWithItems[];

    return orders.map((o) => this.toOrderDto(o));
  }

  async board(params: {
    statusIn?: OrderStatus[];
    channelIn?: Array<'web' | 'in_store' | 'ubereats'>;
    limit?: number;
    sinceMinutes?: number;
  }): Promise<OrderDto[]> {
    const { statusIn, channelIn, limit = 50, sinceMinutes = 24 * 60 } = params;
    const where: Prisma.OrderWhereInput = {};
    if (statusIn && statusIn.length > 0) where.status = { in: statusIn };
    if (channelIn && channelIn.length > 0) where.channel = { in: channelIn };
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
    return this.toOrderDto(order);
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
    return {
      order: this.toOrderDto(order),
      ownerUserStableId,
    };
  }

  async getPrintPayloadByStableId(
    orderStableId: string,
    locale?: string,
  ): Promise<PrintPosPayloadDto> {
    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: orderStableId.trim() },
      include: { items: true },
    })) as OrderWithItems | null;

    if (!order) throw new NotFoundException('order not found');

    const orderNumber = order.clientRequestId ?? order.orderStableId;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const deliveryCostCents = order.deliveryCostCents ?? 0;
    const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
    const deliverySubsidyCents =
      typeof deliverySubsidyCentsRaw === 'number' &&
      Number.isFinite(deliverySubsidyCentsRaw)
        ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
        : Math.max(0, deliveryCostCents - deliveryFeeCents);

    const items = order.items.map((item) => {
      const options = Array.isArray(item.optionsJson)
        ? (item.optionsJson as OrderItemOptionsSnapshot)
        : null;
      const unitPriceCents = item.unitPriceCents ?? 0;

      return {
        productStableId: item.productStableId,
        nameZh: item.nameZh ?? null,
        nameEn: item.nameEn ?? null,
        displayName: item.displayName ?? null,
        quantity: item.qty,
        lineTotalCents: unitPriceCents * item.qty,
        options,
      };
    });

    const discountCents =
      (order.couponDiscountCents ?? 0) + (order.loyaltyRedeemCents ?? 0);

    const paymentMethod = (() => {
      switch (order.paymentMethod) {
        case PaymentMethod.CASH:
          return 'cash';
        case PaymentMethod.CARD:
          return 'card';
        case PaymentMethod.WECHAT_ALIPAY:
          return 'wechat_alipay';
        case PaymentMethod.STORE_BALANCE:
          return 'store_balance';
        default:
          return order.channel === Channel.in_store ? 'cash' : 'card';
      }
    })();

    return {
      locale: locale ?? 'zh',
      orderNumber,
      pickupCode: order.pickupCode ?? null,
      fulfillment: order.fulfillmentType,
      paymentMethod,
      snapshot: {
        items,
        subtotalCents: order.subtotalCents ?? 0,
        taxCents: order.taxCents ?? 0,
        totalCents: order.totalCents ?? 0,
        discountCents,
        deliveryFeeCents,
        deliveryCostCents,
        deliverySubsidyCents,
      },
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
    const discountCents =
      (order.loyaltyRedeemCents ?? 0) + (order.couponDiscountCents ?? 0);

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

      return {
        productStableId: item.productStableId,
        name: display,
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        quantity,
        unitPriceCents,
        totalPriceCents,
        optionsJson: optionsSnapshot,
      };
    });

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
      taxCents,
      deliveryFeeCents,
      discountCents,
      totalCents: order.totalCents ?? 0,
      lineItems,
    };
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

    const payload = await this.getPrintPayloadByStableId(
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
      if (order.status !== 'paid') {
        throw new BadRequestException('only paid order can be amended');
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
        (order.subtotalCents ?? 0) - (order.loyaltyRedeemCents ?? 0),
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

  private normalizeDropoff(
    destination: DeliveryDestinationInput,
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

  private buildUberPickupOverride(
    config: BusinessConfig,
  ): UberDirectPickupDetails | undefined {
    const sanitize = (value?: string | null): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const pickup: UberDirectPickupDetails = {
      businessName: sanitize(config.storeName),
      contactName: sanitize(config.storeName),
      phone: sanitize(config.supportPhone),
      addressLine1: sanitize(config.storeAddressLine1),
      addressLine2: sanitize(config.storeAddressLine2),
      city: sanitize(config.storeCity),
      province: sanitize(config.storeProvince),
      postalCode: sanitize(config.storePostalCode),
      latitude:
        typeof config.storeLatitude === 'number'
          ? config.storeLatitude
          : undefined,
      longitude:
        typeof config.storeLongitude === 'number'
          ? config.storeLongitude
          : undefined,
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

  private async dispatchStandardDeliveryWithDoorDash(
    order: OrderWithItems,
    destination: UberDirectDropoffDetails,
  ): Promise<OrderWithItems> {
    // ✅ 第三方识别：优先 clientRequestId；给人看：SQ 单号
    const thirdPartyOrderRef = order.clientRequestId;
    if (!thirdPartyOrderRef) {
      throw new BadRequestException('clientRequestId required for delivery');
    }
    const humanRef = order.clientRequestId ?? order.orderStableId ?? '';

    const response: DoorDashDeliveryResult =
      await this.doorDashDrive.createDelivery({
        orderRef: thirdPartyOrderRef, // ✅ 外发：优先 clientRequestId
        pickupCode: order.pickupCode ?? undefined,
        reference: humanRef, // ✅ 仅用于人类识别（SQYYMMDD####）
        totalCents: order.totalCents ?? 0,
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
        select: { phone: true },
      });

      if (user && user.phone) {
        destination.phone = user.phone;
        this.logger.log(`✅ [Uber Fix] Restored real phone from database.`);
      } else {
        this.logger.warn(
          `❌ [Uber Fix] User has no phone in DB. Using fallback.`,
        );
      }
    }

    // 2. 格式标准化：确保是 E.164 格式 (+1xxxxxxxxxx)
    if (destination.phone) {
      const originalPhone = destination.phone;
      const digits = originalPhone.replace(/\D/g, ''); // 提取纯数字

      // 如果是 10 位 (4375556666) -> 补 +1
      if (digits.length === 10) {
        destination.phone = `+1${digits}`;
      }
      // 如果是 11 位且以1开头 (14375556666) -> 补 +
      else if (digits.length === 11 && digits.startsWith('1')) {
        destination.phone = `+${digits}`;
      }
    }

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
}
