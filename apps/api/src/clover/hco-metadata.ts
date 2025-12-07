// apps/api/src/clover/hco-metadata.ts
import { DeliveryProvider, DeliveryType } from '@prisma/client';
import { CreateOrderDto } from '../orders/dto/create-order.dto';

export type HostedCheckoutItem = {
  id: string;
  nameEn?: string;
  nameZh?: string;
  displayName?: string;
  quantity: number;
  notes?: string;
  priceCents: number; // 单价：分
  options?: unknown;
};

export type HostedCheckoutCustomer = {
  name: string;
  phone: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
};

export type HostedCheckoutMetadata = {
  locale?: string;
  fulfillment: 'pickup' | 'delivery';
  schedule?: string;
  customer: HostedCheckoutCustomer;
  items: HostedCheckoutItem[];

  // 全部用“分”
  subtotalCents: number;
  taxCents: number;
  serviceFeeCents?: number;
  deliveryFeeCents?: number;
  totalCents?: number;

  taxRate?: number; // 仍然是 0.13 这种小数
  deliveryType?: DeliveryType;
  deliveryProvider?: DeliveryProvider;
  deliveryEtaMinutes?: [number, number];
  deliveryDistanceKm?: number;

  // ===== 积分相关（可选）=====
  loyaltyRedeemCents?: number; // 本单用积分抵扣的金额（分）
  loyaltyAvailableDiscountCents?: number; // 前端计算的“最多可抵扣金额”（分），仅调试使用
  loyaltyPointsBalance?: number; // 下单前积分余额（点）
  loyaltyUserId?: string; // 会员 userId，用于把订单绑定到会员

  coupon?: {
    id?: string;
    code?: string;
    title?: string;
    discountCents?: number;
    minSpendCents?: number;
    expiresAt?: string;
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

// ===== cents helpers =====
const toCents = (value: unknown, label: string): number => {
  const num = toNumber(value);
  if (typeof num !== 'number' || num < 0) {
    throw new Error(`${label} (cents) is required and must be ≥ 0`);
  }
  return Math.round(num);
};

const toOptionalCents = (value: unknown): number | undefined => {
  const num = toNumber(value);
  if (typeof num !== 'number' || num < 0) return undefined;
  return Math.round(num);
};

const parseFulfillment = (value: unknown): 'pickup' | 'delivery' => {
  const normalized = toString(value)?.toLowerCase();
  if (normalized === 'pickup' || normalized === 'delivery') return normalized;
  throw new Error('fulfillment must be pickup or delivery');
};

const parseLocale = (value: unknown): string | undefined =>
  toString(value)?.toLowerCase();

const parseDeliveryType = (value: unknown): DeliveryType | undefined => {
  const normalized = toString(value)?.toUpperCase();
  if (normalized === DeliveryType.STANDARD) return DeliveryType.STANDARD;
  if (normalized === DeliveryType.PRIORITY) return DeliveryType.PRIORITY;
  return undefined;
};

const parseDeliveryProvider = (
  value: unknown,
): DeliveryProvider | undefined => {
  const normalized = toString(value)?.toUpperCase();
  if (normalized === DeliveryProvider.UBER) return DeliveryProvider.UBER;
  if (normalized === DeliveryProvider.DOORDASH)
    return DeliveryProvider.DOORDASH;
  return undefined;
};

const parseEtaRange = (value: unknown): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const first = toNumber(value[0]);
  const second = toNumber(value[1]);
  if (typeof first !== 'number' || typeof second !== 'number') return undefined;
  return [Math.round(first), Math.round(second)];
};

const parseItems = (value: unknown): HostedCheckoutItem[] => {
  if (!Array.isArray(value)) {
    throw new Error('items must be an array');
  }

  const items = value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;

      const id = toString(entry.id);
      // 前端统一传 priceCents；为了安全，也兼容 price 字段，但一律当作“分”
      const priceCents =
        toOptionalCents(entry.priceCents) ?? toOptionalCents(entry.price);
      if (!id || typeof priceCents !== 'number') return null;

      const quantity = Math.max(1, Math.round(toNumber(entry.quantity) ?? 1));
      const notes = toString(entry.notes);

      const nameEn = toString(entry.nameEn);
      const nameZh = toString(entry.nameZh);
      const displayName = toString(entry.displayName);

      const rawOptions = entry.options;
      const options = isPlainObject(rawOptions) ? rawOptions : undefined;

      const item: HostedCheckoutItem = {
        id,
        priceCents,
        quantity,
      };

      if (notes) item.notes = notes;
      if (nameEn) item.nameEn = nameEn;
      if (nameZh) item.nameZh = nameZh;
      if (displayName) item.displayName = displayName;
      if (typeof options !== 'undefined') item.options = options;

      return item;
    })
    .filter((item): item is HostedCheckoutItem => Boolean(item));

  if (items.length === 0) {
    throw new Error('items must include at least one entry');
  }

  return items;
};

const parseCoupon = (
  value: unknown,
): HostedCheckoutMetadata['coupon'] | undefined => {
  if (!isPlainObject(value)) return undefined;

  const id = toString(value.id);
  if (!id) return undefined;

  return {
    id,
    code: toString(value.code),
    title: toString(value.title),
    discountCents: toOptionalCents(value.discountCents),
    minSpendCents: toOptionalCents(value.minSpendCents),
    expiresAt: toString(value.expiresAt),
  };
};

const parseCustomer = (value: unknown): HostedCheckoutCustomer => {
  if (!isPlainObject(value)) {
    throw new Error('customer is required');
  }
  const name = toString(value.name);
  const phone = toString(value.phone);
  if (!name || !phone) {
    throw new Error('customer name and phone are required');
  }
  return {
    name,
    phone,
    addressLine1: toString(value.addressLine1),
    addressLine2: toString(value.addressLine2),
    city: toString(value.city),
    province: toString(value.province),
    postalCode: toString(value.postalCode),
    country: toString(value.country),
    notes: toString(value.notes),
  } satisfies HostedCheckoutCustomer;
};

export function parseHostedCheckoutMetadata(
  input: unknown,
): HostedCheckoutMetadata {
  if (!isPlainObject(input)) {
    throw new Error('metadata must be an object');
  }

  const fulfillment = parseFulfillment(input.fulfillment);
  const items = parseItems(input.items);
  const customer = parseCustomer(input.customer);

  const subtotalCents = toCents(input.subtotalCents, 'subtotalCents');
  const taxCents = toCents(input.taxCents, 'taxCents');

  return {
    locale: parseLocale(input.locale),
    fulfillment,
    schedule: toString(input.schedule),
    customer,
    items,
    subtotalCents,
    taxCents,
    serviceFeeCents: toOptionalCents(input.serviceFeeCents),
    deliveryFeeCents: toOptionalCents(input.deliveryFeeCents),
    totalCents: toOptionalCents(input.totalCents),
    taxRate: toNumber(input.taxRate),
    deliveryType: parseDeliveryType(input.deliveryType),
    deliveryProvider: parseDeliveryProvider(input.deliveryProvider),
    deliveryEtaMinutes: parseEtaRange(input.deliveryEtaMinutes),
    deliveryDistanceKm: toNumber(input.deliveryDistanceKm),

    // ===== 新增：积分相关 =====
    loyaltyRedeemCents: toOptionalCents(input.loyaltyRedeemCents),
    loyaltyAvailableDiscountCents: toOptionalCents(
      input.loyaltyAvailableDiscountCents,
    ),
    loyaltyPointsBalance: toNumber(input.loyaltyPointsBalance),
    loyaltyUserId: toString(input.loyaltyUserId),
    coupon: parseCoupon(input.coupon),
  } satisfies HostedCheckoutMetadata;
}

// ===== 把 metadata 转成 CreateOrderDto =====

const buildDestination = (
  meta: HostedCheckoutMetadata,
): CreateOrderDto['deliveryDestination'] => {
  // 只有 fulfillment = delivery 才需要地址
  if (meta.fulfillment !== 'delivery') return undefined;

  const { customer } = meta;
  const requiredFields = [
    customer.addressLine1,
    customer.city,
    customer.province,
    customer.postalCode,
  ];

  const missingRequired = requiredFields.some((field) => !field);

  // 地址不完整时直接返回 undefined，不 throw
  if (missingRequired) {
    return undefined;
  }

  return {
    name: customer.name,
    phone: customer.phone,
    addressLine1: customer.addressLine1!,
    addressLine2: customer.addressLine2,
    city: customer.city!,
    province: customer.province!,
    postalCode: customer.postalCode!,
    country: customer.country ?? 'Canada',
    instructions: customer.notes,
    notes: customer.notes,
  };
};

export function buildOrderDtoFromMetadata(
  raw: unknown,
  clientRequestId: string,
): CreateOrderDto {
  // 统一从原始 JSON 解析，容错更好
  const meta = parseHostedCheckoutMetadata(raw);

  const subtotalCents = meta.subtotalCents;
  const taxCents = meta.taxCents;
  const deliveryFeeCents = meta.deliveryFeeCents ?? 0;
  const serviceFeeCents = meta.serviceFeeCents ?? 0;

  const redeemValueCents = meta.loyaltyRedeemCents ?? 0;

  const dto: CreateOrderDto = {
    clientRequestId,
    channel: 'web',

    // ⭐ 关键：让订单有 userId，这样 paid 时才会结算积分
    ...(meta.loyaltyUserId ? { userId: meta.loyaltyUserId } : {}),

    fulfillmentType: meta.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    subtotalCents,

    // 这些字段现在主要用于兼容 / 调试，实际金额在 OrdersService 里会重新计算
    taxCents,
    totalCents: subtotalCents + taxCents + deliveryFeeCents + serviceFeeCents,
    ...(deliveryFeeCents > 0 ? { deliveryFeeCents } : {}),

    // ⭐ 告诉 OrdersService 本单用了多少积分抵扣（分）
    ...(redeemValueCents > 0 ? { redeemValueCents } : {}),

    items: meta.items.map((item) => {
      const options: Record<string, unknown> | undefined = (() => {
        const result: Record<string, unknown> = {};

        if (isPlainObject(item.options)) {
          Object.assign(result, item.options);
        }

        if (item.notes) {
          result.notes = item.notes;
        }

        return Object.keys(result).length > 0 ? result : undefined;
      })();

      return {
        productId: item.id,
        qty: item.quantity,

        // ⭐ 重要：CreateOrderDto.unitPrice 是“美元”，所以这里用 priceCents / 100
        unitPrice: item.priceCents / 100,

        ...(item.displayName ? { displayName: item.displayName } : {}),
        ...(item.nameEn ? { nameEn: item.nameEn } : {}),
        ...(item.nameZh ? { nameZh: item.nameZh } : {}),

        ...(options ? { options } : {}),
      };
    }),
  };

  if (meta.coupon?.id) {
    dto.couponId = meta.coupon.id;
  }

  if (meta.fulfillment === 'delivery') {
    dto.deliveryType = meta.deliveryType ?? DeliveryType.STANDARD;
    const destination = buildDestination(meta);
    if (destination) {
      dto.deliveryDestination = destination;
    }
  }

  return dto;
}
