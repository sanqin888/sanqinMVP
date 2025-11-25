import { DeliveryProvider, DeliveryType } from '@prisma/client';
import { CreateOrderDto } from '../orders/dto/create-order.dto';

export type HostedCheckoutItem = {
  id: string;
  name?: string;
  quantity: number;
  notes?: string;
  price: number;
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
  subtotal: number;
  tax: number;
  serviceFee?: number;
  deliveryFee?: number;
  taxRate?: number;
  deliveryType?: DeliveryType;
  deliveryProvider?: DeliveryProvider;
  deliveryEtaMinutes?: [number, number];
  deliveryDistanceKm?: number;
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

const toMoney = (value: unknown, label: string): number => {
  const num = toNumber(value);
  if (typeof num !== 'number') {
    throw new Error(`${label} is required`);
  }
  return Math.round(num * 100) / 100;
};

const toOptionalMoney = (value: unknown): number | undefined => {
  const num = toNumber(value);
  if (typeof num !== 'number') return undefined;
  return Math.round(num * 100) / 100;
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
  if (normalized === DeliveryProvider.DOORDASH)
    return DeliveryProvider.DOORDASH;
  if (normalized === DeliveryProvider.UBER) return DeliveryProvider.UBER;
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
      const price = toNumber(entry.price);
      if (!id || typeof price !== 'number') return null;
      const quantity = Math.max(1, Math.round(toNumber(entry.quantity) ?? 1));
      const notes = toString(entry.notes);
      const name = toString(entry.name);
      return {
        id,
        price,
        quantity,
        ...(notes ? { notes } : {}),
        ...(name ? { name } : {}),
      };
    })
    .filter((item): item is HostedCheckoutItem => Boolean(item));

  if (items.length === 0) {
    throw new Error('items must include at least one entry');
  }

  return items;
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

  return {
    locale: parseLocale(input.locale),
    fulfillment,
    schedule: toString(input.schedule),
    customer,
    items,
    subtotal: toMoney(input.subtotal ?? input.subtotalCents, 'subtotal'),
    tax: toMoney(input.tax ?? input.taxTotal, 'tax'),
    serviceFee: toOptionalMoney(input.serviceFee),
    deliveryFee: toOptionalMoney(input.deliveryFee),
    taxRate: toNumber(input.taxRate),
    deliveryType: parseDeliveryType(input.deliveryType),
    deliveryProvider: parseDeliveryProvider(input.deliveryProvider),
    deliveryEtaMinutes: parseEtaRange(input.deliveryEtaMinutes),
    deliveryDistanceKm: toNumber(input.deliveryDistanceKm),
  } satisfies HostedCheckoutMetadata;
}

const dollarsToCents = (value: number): number => Math.round(value * 100);

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

  // ⚠️ 地址不完整时，直接返回 undefined，不再 throw，
  // 这样 webhook 仍然能建订单，只是不会调 Uber Direct。
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
  meta: HostedCheckoutMetadata,
  clientRequestId: string,
): CreateOrderDto {
  const subtotalCents = dollarsToCents(meta.subtotal);
  const taxCents = dollarsToCents(meta.tax);
  const deliveryFeeCents =
    typeof meta.deliveryFee === 'number' ? dollarsToCents(meta.deliveryFee) : 0;

  const dto: CreateOrderDto = {
    clientRequestId,
    channel: 'web',
    fulfillmentType: meta.fulfillment === 'delivery' ? 'delivery' : 'pickup',
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    ...(deliveryFeeCents > 0 ? { deliveryFeeCents } : {}),
    items: meta.items.map((item) => ({
      productId: item.id,
      qty: item.quantity,
      unitPrice: item.price,
      ...(item.notes ? { options: { notes: item.notes } } : {}),
    })),
  };

  if (meta.fulfillment === 'delivery') {
    dto.deliveryType = meta.deliveryType ?? DeliveryType.STANDARD;
    const destination = buildDestination(meta);
    if (destination) {
      dto.deliveryDestination = destination;
    }
  }

  return dto;
}
