// apps/api/src/orders/orders.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { DeliveryProvider, DeliveryType, Prisma } from '@prisma/client';
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
  UberDirectService,
} from '../deliveries/uber-direct.service';
import { DoorDashDriveService } from '../deliveries/doordash-drive.service';
import { parseHostedCheckoutMetadata } from '../clover/hco-metadata';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

function parseNumberEnv(
  envValue: string | undefined,
  fallback: number,
): number {
  const n = Number(envValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TAX_RATE = parseNumberEnv(process.env.SALES_TAX_RATE, 0.13);

const REDEEM_DOLLAR_PER_POINT = parseNumberEnv(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT,
  1,
);

// ——— 简单 UUID 判断，用在 thank-you 查询里 ——-
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isUuid = (value: string | null | undefined): boolean =>
  typeof value === 'string' && UUID_REGEX.test(value);

/**
 * 固定的“配送类型 → 供应商 + 预计费用 + 预估 ETA”
 * feeCents 在现在版本更多是“参考值/基准成本”，真实成本通过第三方 API 返回写入 deliveryCostCents。
 */
const DELIVERY_RULES: Record<
  DeliveryType,
  { provider: DeliveryProvider; feeCents: number; etaRange: [number, number] }
> = {
  [DeliveryType.STANDARD]: {
    provider: DeliveryProvider.DOORDASH,
    feeCents: 500,
    etaRange: [45, 60],
  },
  [DeliveryType.PRIORITY]: {
    provider: DeliveryProvider.UBER,
    feeCents: 900,
    etaRange: [25, 35],
  },
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
  ) {}

  /** 从稳定 ID（例如 SQ******）里抽取“取餐码”（4 位数字，取末 4 位） */
  private derivePickupCode(source?: string | null): string | undefined {
    if (!source) return undefined;

    // 提取里面所有数字
    const digits = source.replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4); // 末 4 位
    }
    if (digits.length > 0) {
      // 不足 4 位就左侧补 0
      return digits.padStart(4, '0');
    }
    return undefined;
  }

  /** 计算“本单可用的抵扣额（分）”，受余额 / 用户请求 / 小计 的三重上限约束 */
  private async calcRedeemCents(
    userId: string | undefined,
    requestedPoints?: number,
    subtotalCents?: number,
  ): Promise<number> {
    if (!userId || !requestedPoints || requestedPoints <= 0) return 0;

    const balanceMicro = await this.loyalty.peekBalanceMicro(userId);
    const maxByBalance =
      this.loyalty.maxRedeemableCentsFromBalance(balanceMicro);

    // 用户请求的点数 → 折算成“可抵扣金额（分）”
    const rawCents = requestedPoints * REDEEM_DOLLAR_PER_POINT * 100;
    const requestedCents = Math.round(rawCents + 1e-6);

    const byUserInput = Math.min(requestedCents, maxByBalance);
    return Math.max(0, Math.min(byUserInput, subtotalCents ?? byUserInput));
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
        `${this.formatOrderLogContext({
          clientRequestId: dto.clientRequestId ?? null,
        })}Priority delivery order is missing deliveryDestination; creating order without Uber Direct dispatch.`,
      );
    }

    // —— Idempotency-Key 归一化（HTTP 头里带的优先）
    const headerKey =
      typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined;
    const normalizedHeaderKey = normalizeStableId(headerKey);
    if (headerKey && !normalizedHeaderKey) {
      this.logger.warn(
        `${this.formatOrderLogContext({
          clientRequestId: dto.clientRequestId ?? null,
        })}Ignoring invalid Idempotency-Key header: ${headerKey}`,
      );
    }

    // —— body 里的 clientRequestId：标准化（uuid/cuid），失败就用原始字符串
    const bodyKey =
      typeof dto.clientRequestId === 'string'
        ? dto.clientRequestId.trim()
        : undefined;
    const normalizedBodyKey = normalizeStableId(bodyKey);
    const bodyStableKey = normalizedBodyKey ?? bodyKey;

    const stableKey = normalizedHeaderKey ?? bodyStableKey;

    if (stableKey) {
      const existing = await this.prisma.order.findUnique({
        where: { clientRequestId: stableKey },
        include: { items: true },
      });
      if (existing) {
        return existing as OrderWithItems;
      }
    }

    // —— 统一取餐码：优先 dto.pickupCode，其次稳定 ID（比如 SQ****** 的后四位），最后随机 4 位数字
    const explicitPickupCode =
      typeof dto.pickupCode === 'string' && dto.pickupCode.trim().length > 0
        ? dto.pickupCode.trim()
        : undefined;

    const pickupCode =
      explicitPickupCode ??
      this.derivePickupCode(stableKey) ??
      (1000 + Math.floor(Math.random() * 9000)).toString();

    // —— 订单联系人信息（和账号手机号 User.phone 区分开）
    // 优先用 DTO 上的 contactName / contactPhone（如果你在 CreateOrderDto 里加了这俩字段），
    // 其次回退到 deliveryDestination.name / phone（外送场景）。
    const contactName =
      typeof dto.contactName === 'string' && dto.contactName.trim().length > 0
        ? dto.contactName.trim()
        : typeof dto.deliveryDestination?.name === 'string' &&
            dto.deliveryDestination.name.trim().length > 0
          ? dto.deliveryDestination.name.trim()
          : null;

    const contactPhone =
      typeof dto.contactPhone === 'string' && dto.contactPhone.trim().length > 0
        ? dto.contactPhone.trim()
        : typeof dto.deliveryDestination?.phone === 'string' &&
            dto.deliveryDestination.phone.trim().length > 0
          ? dto.deliveryDestination.phone.trim()
          : null;

    // 1) 服务端重算金额（兼容旧版“单位：分”字段）
    const subtotalCentsRaw =
      typeof dto.subtotalCents === 'number' ? dto.subtotalCents : undefined;
    if (
      typeof subtotalCentsRaw !== 'number' ||
      Number.isNaN(subtotalCentsRaw)
    ) {
      throw new BadRequestException('subtotal is required');
    }
    const subtotalCents = subtotalCentsRaw;

    const couponInfo = await this.membership.validateCouponForOrder({
      userId: dto.userId,
      couponId: dto.couponId,
      subtotalCents,
    });
    const couponDiscountCents = couponInfo?.discountCents ?? 0;
    const subtotalAfterCoupon = Math.max(
      0,
      subtotalCents - couponDiscountCents,
    );

    // 统一把“用户请求抵扣多少”转成“点数”
    const requestedPoints =
      typeof dto.pointsToRedeem === 'number'
        ? dto.pointsToRedeem
        : typeof dto.redeemValueCents === 'number' &&
            REDEEM_DOLLAR_PER_POINT > 0
          ? dto.redeemValueCents / (REDEEM_DOLLAR_PER_POINT * 100)
          : undefined;

    // 2) 计算本单实际抵扣金额（分），受余额 / 用户请求 / 小计三重约束
    const redeemValueCents = await this.calcRedeemCents(
      dto.userId,
      requestedPoints,
      subtotalAfterCoupon,
    );

    // 是否为配送订单
    const isDelivery =
      dto.fulfillmentType === 'delivery' ||
      dto.deliveryType === DeliveryType.STANDARD ||
      dto.deliveryType === DeliveryType.PRIORITY;

    // 顾客支付的配送费（前端传来的分），没有就按 0
    const deliveryFeeCustomerCents =
      isDelivery && typeof dto.deliveryFeeCents === 'number'
        ? dto.deliveryFeeCents
        : 0;

    // 供应商 / ETA 等元信息（成本价 deliveryCostCents 先不在这里写）
    const deliveryMeta = dto.deliveryType
      ? DELIVERY_RULES[dto.deliveryType]
      : undefined;

    // 3) 税基：菜品小计 - 优惠券 - 积分 + 配送费（配送费也计税，对齐前端 Checkout）
    const purchaseBaseCents = Math.max(
      0,
      subtotalAfterCoupon - redeemValueCents,
    );
    const taxableCents =
      purchaseBaseCents + (isDelivery ? deliveryFeeCustomerCents : 0);

    const taxCents = Math.round(taxableCents * TAX_RATE);

    // 顾客总价 = (小计 - 优惠券 - 积分) + 配送费 + 税
    const totalCents = purchaseBaseCents + deliveryFeeCustomerCents + taxCents;

    // ⭐️ 这里直接把“优惠券/积分抵扣金额”和“折后小计”写入 DB 字段
    const loyaltyRedeemCents = redeemValueCents;
    const subtotalAfterDiscountCents = Math.max(
      0,
      subtotalCents - couponDiscountCents - loyaltyRedeemCents,
    );

    // 4) 入库
    let order: OrderWithItems = (await this.prisma.order.create({
      data: {
        userId: dto.userId ?? null,
        ...(stableKey ? { clientRequestId: stableKey } : {}),
        channel: dto.channel,
        fulfillmentType: dto.fulfillmentType,
        ...(contactName ? { contactName } : {}),
        ...(contactPhone ? { contactPhone } : {}),
        subtotalCents,
        taxCents,
        totalCents,
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
              // 顾客支付的配送费（前端算好的）
              deliveryFeeCents: deliveryFeeCustomerCents,
              deliveryEtaMinMinutes: deliveryMeta.etaRange[0],
              deliveryEtaMaxMinutes: deliveryMeta.etaRange[1],
            }
          : {}),
items: {
  create: (Array.isArray(dto.items) ? dto.items : []).map(
    (i): Prisma.OrderItemCreateWithoutOrderInput => {
      const unitPriceCents =
        typeof i.unitPrice === 'number'
          ? Math.round(i.unitPrice * 100)
          : undefined;

      const trimmedDisplay =
        typeof i.displayName === 'string' ? i.displayName.trim() : '';
      const trimmedEn =
        typeof i.nameEn === 'string' ? i.nameEn.trim() : '';
      const trimmedZh =
        typeof i.nameZh === 'string' ? i.nameZh.trim() : '';

      const displayName =
        trimmedDisplay || trimmedEn || trimmedZh || i.productStableId;

      const base: Prisma.OrderItemCreateWithoutOrderInput = {
        productStableId: i.productStableId,
        qty: i.qty,
        displayName,
      };

      if (trimmedEn) base.nameEn = trimmedEn;
      if (trimmedZh) base.nameZh = trimmedZh;
      if (typeof unitPriceCents === 'number') base.unitPriceCents = unitPriceCents;
      if (typeof i.options !== 'undefined') {
        base.optionsJson = i.options as Prisma.InputJsonValue;
      }

      return base;
    },
  ),
},
      },
      include: { items: true },
    })) as OrderWithItems;

    this.logger.log(
      `${this.formatOrderLogContext({
        orderId: order.id,
        clientRequestId: order.clientRequestId ?? null,
      })}Order created successfully.`,
    );

    // === Standard 配送：DoorDash Drive ===
    if (dto.deliveryType === DeliveryType.STANDARD && dto.deliveryDestination) {
      const destination = this.normalizeDropoff(dto.deliveryDestination);

      const provider = deliveryMeta?.provider ?? order.deliveryProvider;
      const doordashEnabled = process.env.DOORDASH_DRIVE_ENABLED === '1';

      if (provider !== DeliveryProvider.DOORDASH) {
        this.logger.warn(
          `${this.formatOrderLogContext({
            orderId: order.id,
            clientRequestId: order.clientRequestId ?? null,
          })}Standard delivery provider is not DOORDASH, skipping DoorDash dispatch.`,
        );
      } else if (!doordashEnabled) {
        this.logger.warn(
          `${this.formatOrderLogContext({
            orderId: order.id,
            clientRequestId: order.clientRequestId ?? null,
          })}Skipping DoorDash dispatch because DOORDASH_DRIVE_ENABLED is not '1'.`,
        );
      } else {
        try {
          order = await this.dispatchStandardDeliveryWithDoorDash(
            order,
            destination,
          );
        } catch (error) {
          this.logger.error(
            `${this.formatOrderLogContext({
              orderId: order.id,
              clientRequestId: order.clientRequestId ?? null,
            })}Failed to dispatch DoorDash delivery: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // 不抛异常，留给后台人工处理
        }
      }
    }

    // === Priority 配送：Uber Direct ===
    if (dto.deliveryType === DeliveryType.PRIORITY && dto.deliveryDestination) {
      const destination = this.normalizeDropoff(dto.deliveryDestination);

      const uberEnabled = process.env.UBER_DIRECT_ENABLED === '1';
      if (!uberEnabled) {
        this.logger.warn(
          `${this.formatOrderLogContext({
            orderId: order.id,
            clientRequestId: order.clientRequestId ?? null,
          })}Skipping Uber Direct dispatch because UBER_DIRECT_ENABLED is not '1'.`,
        );
      } else {
        try {
          order = await this.dispatchPriorityDelivery(order, destination);
        } catch (error) {
          this.logger.error(
            `${this.formatOrderLogContext({
              orderId: order.id,
              clientRequestId: order.clientRequestId ?? null,
            })}Failed to dispatch Uber Direct delivery: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          // 不抛异常，留给后台人工处理
        }
      }
    }

    return order;
  }

  /**
   * Checkout 纯积分路线：
   * 前端传入 Clover 用的 payload（amountCents + metadata），
   * 在这里把 metadata 用 parseHostedCheckoutMetadata 解析成强类型，
   * 再转换成 CreateOrderDto，最后复用 createImmediatePaid() 的逻辑。
   */
  async createLoyaltyOnlyOrder(payload: unknown): Promise<OrderWithItems> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('invalid payload');
    }

    const { amountCents, referenceId, metadata } = payload as {
      amountCents?: unknown;
      referenceId?: unknown;
      metadata?: unknown;
    };

    if (metadata == null) {
      throw new BadRequestException('metadata is required');
    }

    if (typeof amountCents !== 'number' || amountCents !== 0) {
      throw new BadRequestException(
        'Loyalty-only orders must have amountCents === 0',
      );
    }

    // ⭐ 用统一的解析函数，把 metadata 从 unknown → HostedCheckoutMetadata
    const meta = parseHostedCheckoutMetadata(metadata);

    const loyaltyRedeemCents = meta.loyaltyRedeemCents ?? 0;
    const loyaltyUserId = meta.loyaltyUserId;

    if (!loyaltyUserId || loyaltyRedeemCents <= 0) {
      throw new BadRequestException(
        'loyaltyUserId and positive loyaltyRedeemCents are required',
      );
    }

    // 仅在外送时需要 deliveryDestination
    let deliveryDestination: DeliveryDestinationDto | undefined;

    if (meta.fulfillment === 'delivery') {
      const { customer } = meta;

      // ⭐ 这里做一层校验 + narrowing，让 TS 确认这些字段一定是 string
      if (
        !customer.addressLine1 ||
        !customer.city ||
        !customer.province ||
        !customer.postalCode
      ) {
        throw new BadRequestException(
          'Delivery address is incomplete for loyalty-only delivery order',
        );
      }

      deliveryDestination = {
        name: customer.name,
        phone: customer.phone,
        company: undefined,
        addressLine1: customer.addressLine1, // 这里 TS 已经 narrowed 成 string
        addressLine2: customer.addressLine2,
        city: customer.city,
        province: customer.province,
        postalCode: customer.postalCode,
        country: customer.country ?? 'Canada',
        instructions: customer.notes,
        notes: undefined,
        latitude: undefined,
        longitude: undefined,
        tipCents: undefined,
      };
    }

    const clientRequestId =
      typeof referenceId === 'string' ? referenceId : undefined;

    // 把解析好的 meta 映射成内部 CreateOrderDto
    const dto: CreateOrderDto = {
      userId: loyaltyUserId,
      clientRequestId,
      channel: 'web',
      fulfillmentType: meta.fulfillment,
      deliveryType: meta.deliveryType,
      deliveryDestination,
      subtotalCents: meta.subtotalCents,
      // 这里仍然传 redeemValueCents，由 create() 里统一用公式重算/封顶
      redeemValueCents: loyaltyRedeemCents,
      deliveryFeeCents: meta.deliveryFeeCents,
      items: meta.items.map((item) => ({
        productStableId: item.productStableId,
        qty: item.quantity,
        displayName: item.displayName ?? item.nameEn ?? item.nameZh ?? item.id,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        // 单价从“分”还原成 CAD，create() 再 ×100 存 unitPriceCents
        unitPrice: item.priceCents / 100,
      })),
    };

    // 复用“创建订单 + 直接标记为 paid”的逻辑，
    // 内部会调用 loyalty.settleOnPaid，积分结算跟正常 paid 一致。
    const idempotencyKey = clientRequestId;
    return this.createImmediatePaid(dto, idempotencyKey);
  }

  /**
   * 用于“只用积分支付”的场景：
   * - 先按普通 create() 流程创建订单（状态 pending）
   * - 然后直接把状态切到 paid，触发 loyalty.settleOnPaid
   * - 如果幂等重试导致订单已经是 paid，则不会再重复结算
   */
  async createImmediatePaid(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const created = await this.create(dto, idempotencyKey);

    // 幂等重试：如果已经是 paid，就直接返回
    if (created.status === 'paid') {
      return created;
    }

    // 正常从 pending -> paid，内部会调用 loyalty.settleOnPaid
    const paidOrder = await this.updateStatus(created.id, 'paid');
    return paidOrder;
  }

  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  /**
   * 门店看板用：
   * - 支持按状态 / 渠道过滤
   * - 默认只看最近 N 分钟内的订单，避免历史数据太多
   */
  async board(params: {
    statusIn?: OrderStatus[];
    channelIn?: Array<'web' | 'in_store' | 'ubereats'>;
    limit?: number;
    sinceMinutes?: number;
  }): Promise<OrderWithItems[]> {
    const { statusIn, channelIn, limit = 50, sinceMinutes = 24 * 60 } = params;

    const where: Prisma.OrderWhereInput = {};

    if (statusIn && statusIn.length > 0) {
      // Prisma 的枚举类型和你本地的 OrderStatus 字面量是一致的
      where.status = { in: statusIn };
    }

    if (channelIn && channelIn.length > 0) {
      where.channel = { in: channelIn };
    }

    // 只看最近一段时间的订单（默认 24 小时）
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

  // 订单详情：直接返回包含 DB 里 loyaltyRedeemCents / subtotalAfterDiscountCents 的订单
  async getById(id: string): Promise<OrderWithItems> {
    const order = (await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    })) as OrderWithItems | null;

    if (!order) {
      throw new NotFoundException('order not found');
    }

    return order;
  }

  /**
   * thank-you 页订单小结：
   * - 支持用内部 UUID（order.id）查询
   * - 也支持用外部稳定号（例如 SQ******）查询
   * - 若 Order 表找不到，再通过 CheckoutIntent.referenceId / checkoutSessionId → orderId 反查
   */
  async getPublicOrderSummary(orderParam: string): Promise<OrderSummaryDto> {
    const value = (orderParam ?? '').trim();
    if (!value) {
      throw new NotFoundException('order not found');
    }

    const include = { items: true as const };
    let order: OrderWithItems | null = null;

    // 1) 先尝试直接从 Order 表查
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

    // 2) 如果还没找到，通过 CheckoutIntent (referenceId / checkoutSessionId) 反查 orderId
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

    if (!order) {
      throw new NotFoundException('order not found');
    }

    const subtotalCents = order.subtotalCents ?? 0;
    const taxCents = order.taxCents ?? 0;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;

    const loyaltyRedeemCents = order.loyaltyRedeemCents ?? null;
    const couponDiscountCents = order.couponDiscountCents ?? null;
    const subtotalAfterDiscountCents =
      order.subtotalAfterDiscountCents ?? null;

    const discountCents =
      (order.loyaltyRedeemCents ?? 0) + (order.couponDiscountCents ?? 0);

const lineItems = order.items.map((item) => {
  const unitPriceCents = item.unitPriceCents ?? 0;
  const quantity = item.qty;
  const totalPriceCents = unitPriceCents * quantity;

  const fallbackName = item.productStableId;
  const trimmedDisplay =
    typeof item.displayName === 'string' ? item.displayName.trim() : '';
  const trimmedEn =
    typeof item.nameEn === 'string' ? item.nameEn.trim() : '';
  const trimmedZh =
    typeof item.nameZh === 'string' ? item.nameZh.trim() : '';

  const display = trimmedDisplay || trimmedEn || trimmedZh || fallbackName;

  return {
    productStableId: item.productStableId,
    name: display,
    nameEn: item.nameEn ?? null,
    nameZh: item.nameZh ?? null,
    quantity,
    unitPriceCents,
    totalPriceCents,
    optionsJson: item.optionsJson ?? undefined,
  };
});

return {
  orderId: order.id,
  clientRequestId: order.clientRequestId,
  orderNumber: order.clientRequestId ?? order.id,
  currency: 'CAD',
  subtotalCents,
  taxCents,
  deliveryFeeCents,
  discountCents,
  totalCents: order.totalCents,

  loyaltyRedeemCents: order.loyaltyRedeemCents ?? null,
  couponDiscountCents: order.couponDiscountCents ?? null,
  subtotalAfterDiscountCents: order.subtotalAfterDiscountCents ?? null,

  lineItems,
};
}
  /** 允许的状态迁移（⚠️ ready 不可退款） */
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

    // —— 积分结算（异步，不阻塞响应）
    if (next === 'paid') {
      const redeemValueCents = updated.loyaltyRedeemCents ?? 0;

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
        redeemValueCents,
      });
    } else if (next === 'refunded') {
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
      latitude: this.sanitizeCoordinate(destination.latitude),
      longitude: this.sanitizeCoordinate(destination.longitude),
      tipCents: this.sanitizeTip(destination.tipCents),
    };
  }

  private sanitizeCoordinate(value?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  /**
   * 统一给订单相关日志加上 [orderId=...] [clientRequestId=...] 前缀，
   * requestId 会由 AppLogger 自动加。
   */
  private formatOrderLogContext(params?: {
    orderId?: string | null;
    clientRequestId?: string | null;
  }): string {
    const parts: string[] = [];

    if (params?.orderId) {
      parts.push(`orderId=${params.orderId}`);
    }
    if (params?.clientRequestId) {
      parts.push(`clientRequestId=${params.clientRequestId}`);
    }

    return parts.length ? `[${parts.join(' ')}] ` : '';
  }

  private sanitizeTip(value?: number): number | undefined {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    return Math.max(0, Math.round(value));
  }

  private async dispatchStandardDeliveryWithDoorDash(
    order: OrderWithItems,
    destination: UberDirectDropoffDetails, // 结构兼容，直接复用
  ): Promise<OrderWithItems> {
    const response = await this.doorDashDrive.createDelivery({
      orderId: order.id,
      pickupCode: order.pickupCode ?? undefined,
      reference: order.clientRequestId ?? undefined,
      totalCents: order.totalCents,
      items: order.items.map((item) => {
        const fallbackName = item.productStableId;

        const trimmedDisplay =
          typeof item.displayName === 'string' ? item.displayName.trim() : '';
        const trimmedEn =
          typeof item.nameEn === 'string' ? item.nameEn.trim() : '';
        const trimmedZh =
          typeof item.nameZh === 'string' ? item.nameZh.trim() : '';

        const name = trimmedDisplay || trimmedEn || trimmedZh || fallbackName;

        return {
          name,
          quantity: item.qty,
          priceCents:
            typeof item.unitPriceCents === 'number'
              ? item.unitPriceCents
              : undefined,
        };
      }),
      destination,
    });

    const updateData: Prisma.OrderUpdateInput = {
      externalDeliveryId: response.deliveryId,
    };

    if (
      typeof response.deliveryCostCents === 'number' &&
      Number.isFinite(response.deliveryCostCents)
    ) {
      updateData.deliveryCostCents = Math.max(
        0,
        Math.round(response.deliveryCostCents),
      );
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
    const response = await this.uberDirect.createDelivery({
      orderId: order.id,
      pickupCode: order.pickupCode,
      reference: order.clientRequestId,
      totalCents: order.totalCents,
      items: order.items.map((item) => {
        const fallbackName = item.productStableId;

        const trimmedDisplay =
          typeof item.displayName === 'string' ? item.displayName.trim() : '';
        const trimmedEn =
          typeof item.nameEn === 'string' ? item.nameEn.trim() : '';
        const trimmedZh =
          typeof item.nameZh === 'string' ? item.nameZh.trim() : '';

        const name = trimmedDisplay || trimmedEn || trimmedZh || fallbackName;

        return {
          name,
          quantity: item.qty,
          priceCents:
            typeof item.unitPriceCents === 'number'
              ? item.unitPriceCents
              : undefined,
        };
      }),
      destination,
    });

    // 这里假设 UberDirectService 未来会把真实成本放在 response.deliveryCostCents（单位：分）
    const updateData: Prisma.OrderUpdateInput = {
      externalDeliveryId: response.deliveryId,
    };

    if (
      typeof (response as { deliveryCostCents?: number }).deliveryCostCents ===
      'number'
    ) {
      updateData.deliveryCostCents = Math.max(
        0,
        Math.round(
          (response as { deliveryCostCents?: number }).deliveryCostCents!,
        ),
      );
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: { items: true },
    }) as Promise<OrderWithItems>;
  }

  private async safeDeleteOrder(id: string): Promise<void> {
    try {
      await this.prisma.order.delete({ where: { id } });
    } catch (cleanupError) {
      this.logger.error(
        `${this.formatOrderLogContext({
          orderId: id,
        })}Failed to roll back order after delivery failure: ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
  }
}
