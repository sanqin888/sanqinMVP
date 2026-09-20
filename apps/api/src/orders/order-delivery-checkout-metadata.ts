import type { UberDirectDropoffDetails } from '../deliveries/public-api';

export type OrderDeliveryContactFallback = {
  contactPhone: string | null;
  contactName: string | null;
};

export type OrderDeliveryDestinationSnapshot = {
  name: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  instructions: string | null;
};

export function readOrderDeliveryDestinationSnapshot(
  metadata: unknown,
  order: OrderDeliveryContactFallback,
): OrderDeliveryDestinationSnapshot | null {
  const root = asRecord(metadata);
  const customer = asRecord(root?.customer);
  const deliveryDestination = asRecord(root?.deliveryDestination);
  if (!customer && !deliveryDestination) return null;

  const firstName = asString(customer?.firstName) ?? '';
  const lastName = asString(customer?.lastName) ?? '';
  return {
    name:
      [firstName, lastName].filter(Boolean).join(' ') ||
      order.contactName ||
      'Customer',
    phone:
      asString(deliveryDestination?.phone) ??
      asString(customer?.phone) ??
      order.contactPhone,
    addressLine1:
      asString(deliveryDestination?.addressLine1) ??
      asString(customer?.addressLine1) ??
      null,
    addressLine2:
      asString(deliveryDestination?.addressLine2) ??
      asString(customer?.addressLine2) ??
      null,
    city:
      asString(deliveryDestination?.city) ?? asString(customer?.city) ?? null,
    province:
      asString(deliveryDestination?.province) ??
      asString(customer?.province) ??
      null,
    postalCode:
      asString(deliveryDestination?.postalCode) ??
      asString(customer?.postalCode) ??
      null,
    country:
      asString(deliveryDestination?.country) ??
      asString(customer?.country) ??
      'Canada',
    instructions:
      asString(deliveryDestination?.instructions) ??
      asString(customer?.notes) ??
      null,
  };
}

export function extractOrderDeliveryDestinationFromCheckoutMetadata(
  metadata: unknown,
  order: OrderDeliveryContactFallback,
): UberDirectDropoffDetails | null {
  const snapshot = readOrderDeliveryDestinationSnapshot(metadata, order);
  if (!snapshot) return null;
  if (!snapshot.phone) {
    throw new Error(
      'DELIVERY_PHONE_REQUIRED: Uber Direct dropoff requires a phone',
    );
  }
  if (
    !snapshot.addressLine1 ||
    !snapshot.city ||
    !snapshot.province ||
    !snapshot.postalCode
  ) {
    return null;
  }

  return {
    name: snapshot.name,
    phone: snapshot.phone,
    addressLine1: snapshot.addressLine1,
    addressLine2: snapshot.addressLine2 ?? undefined,
    city: snapshot.city,
    province: snapshot.province,
    postalCode: snapshot.postalCode,
    country: snapshot.country,
    instructions: snapshot.instructions ?? undefined,
  };
}

export function computeOrderDeliveryPickupReadyAtFromCheckoutMetadata(params: {
  acceptedAt: Date;
  metadata: unknown;
}): Date | undefined {
  const root = asRecord(params.metadata);
  const estimate = asRecord(root?.estimated);
  const prepMinutes = normalizeMinutes(
    asNumber(root?.prepMinutes) ??
      asNumber(root?.estimatedPrepMinutes) ??
      asNumber(root?.prepareMinutes) ??
      asNumber(root?.estimatedReadyMinutes) ??
      asNumber(estimate?.prepMinutes) ??
      asNumber(estimate?.estimatedPrepMinutes),
  );
  if (typeof prepMinutes !== 'number') return undefined;

  const pickupAt = new Date(params.acceptedAt.getTime() + prepMinutes * 60_000);
  return Number.isNaN(pickupAt.getTime()) ? undefined : pickupAt;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeMinutes(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.max(1, Math.round(value));
}
