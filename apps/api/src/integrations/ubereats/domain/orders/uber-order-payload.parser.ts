import { UberOrderStateMachine } from './uber-order.state-machine';
import type {
  ParsedUberModifier,
  ParsedUberOrder,
  ParsedUberOrderItem,
  UberOrderDetailDto,
  UberOrderItemDto,
  UberOrderModifierDto,
} from './uber-order.types';
import type { UberOrderStatus } from './uber-order.types';

/** Database- and transport-free normalization of Uber webhook order bodies. */
export class UberOrderPayloadParser {
  parse(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return null;
    const dto = payload as UberOrderDetailDto;
    const charges = dto.payment?.charges;
    const promotions = dto.payment?.promotions;
    const externalOrderId = readString(
      dto.order_id,
      dto.id,
      dto.external_order_id,
    );
    const totalSource =
      dto.total ??
      dto.total_cents ??
      charges?.total ??
      charges?.total_promo_applied;
    if (!externalOrderId || totalSource === undefined) return null;
    const subtotalCents = readCents(
      dto.subtotal ?? dto.sub_total ?? charges?.sub_total ?? charges?.subtotal,
      dto.subtotal_cents,
      0,
    );
    const taxCents = readCents(
      dto.tax ?? charges?.tax_promo_applied ?? charges?.tax,
      dto.tax_cents,
      0,
    );
    const promoSubtotalCents = readOptionalCents(
      charges?.sub_total_promo_applied,
    );
    const promotionSavingsCents =
      promotions?.promotions?.reduce(
        (sum, promotion) =>
          sum +
          Math.max(0, promotion.promo_discount_value ?? 0) +
          Math.max(0, promotion.promo_delivery_fee_value ?? 0),
        0,
      ) ?? 0;
    const discountCents =
      dto.discount !== undefined ||
      dto.discount_cents !== undefined ||
      dto.discountCents !== undefined
        ? readCents(dto.discount, dto.discount_cents ?? dto.discountCents, 0)
        : promoSubtotalCents !== null
          ? Math.max(0, subtotalCents - promoSubtotalCents)
          : promotionSavingsCents;
    const deliveryFeeCents = readCents(
      dto.delivery_fee ?? charges?.total_fee ?? charges?.delivery_fee,
      undefined,
      0,
    );
    const items = (dto.items ?? dto.cart?.items ?? []).map(parseUberOrderItem);
    const totalCents = readCents(
      dto.total ?? charges?.total ?? charges?.total_promo_applied,
      dto.total_cents,
      subtotalCents - discountCents + taxCents + deliveryFeeCents,
    );
    const customer = dto.customer ?? dto.eater ?? {};
    const eaterName = [
      readString(dto.eater?.first_name),
      readString(dto.eater?.last_name),
    ]
      .filter(Boolean)
      .join(' ');
    return {
      externalOrderId,
      displayId: readString(dto.display_id),
      pickupCode: readString(dto.pickup_code, dto.display_id),
      storeId: readString(dto.store_id, dto.store?.id),
      subtotalCents,
      taxCents,
      totalCents,
      discountCents,
      hasPromotion:
        discountCents > 0 ||
        promoSubtotalCents !== null ||
        (promotions?.promotions?.length ?? 0) > 0,
      deliveryFeeCents,
      contactName: readString(customer.name, customer.full_name, eaterName),
      contactPhone: readString(customer.phone, customer.phone_number),
      paidAt:
        readDate(dto.paid_at, dto.created_at, dto.placed_at) ?? new Date(),
      fulfillmentType: readString(dto.fulfillment_type, dto.type)
        ?.toLowerCase()
        .includes('deliver')
        ? 'delivery'
        : 'pickup',
      estimatedReadyAt: readDate(
        dto.estimated_ready_for_pickup_at,
        dto.estimated_delivery_at,
      ),
      specialInstructions: readString(
        dto.special_instructions,
        dto.cart?.special_instructions,
      ),
      cancellation:
        dto.cancellation || dto.cancelled_at || dto.canceled_at
          ? {
              cancelledBy: readString(
                dto.cancellation?.cancelled_by,
                dto.cancellation?.canceled_by,
              ),
              reasonCode: readString(dto.cancellation?.reason_code),
              reasonDetail: readString(
                dto.cancellation?.reason,
                dto.cancellation?.details,
              ),
              occurredAt:
                readDate(dto.cancelled_at, dto.canceled_at) ?? new Date(),
            }
          : null,
      items,
    };
  }
}

export function parseUberOrderItem(
  item: UberOrderItemDto,
): ParsedUberOrderItem {
  const quantity = Math.max(1, Math.round(item.quantity ?? 1));
  const price = asObject(item.price);
  const modifiers = [
    ...(item.modifiers ?? []).map((modifier) =>
      parseUberModifier(modifier, null),
    ),
    ...(item.selected_modifier_groups ?? []).flatMap((group) =>
      (group.selected_items ?? []).map((modifier) =>
        parseUberModifier(modifier, group.id ?? null),
      ),
    ),
  ];
  const optionsUnitPriceCents = flattenModifiers(modifiers).reduce(
    (sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity,
    0,
  );
  const suppliedUnit = readCents(
    item.unit_price ?? price?.unit_price,
    item.price,
    0,
  );
  const suppliedLine = readCents(
    item.total_price ?? price?.total_price,
    undefined,
    suppliedUnit * quantity,
  );
  const unitPriceCents = suppliedUnit || Math.round(suppliedLine / quantity);
  return {
    externalLineId: readString(item.line_item_id, item.instance_id, item.id),
    externalItemId: readString(item.item_id, item.id),
    stableIdHint: readString(item.external_data),
    displayName: readString(item.title, item.name) ?? 'Unknown Uber item',
    quantity,
    baseUnitPriceCents: Math.max(0, unitPriceCents - optionsUnitPriceCents),
    optionsUnitPriceCents,
    unitPriceCents,
    lineTotalCents: suppliedLine,
    specialInstructions: readString(item.special_instructions),
    modifiers,
  };
}

export function parseUberModifier(
  modifier: UberOrderModifierDto,
  parentExternalId: string | null,
): ParsedUberModifier {
  const externalId = readString(modifier.modifier_id, modifier.id);
  return {
    externalId,
    parentExternalId,
    displayName:
      readString(modifier.title, modifier.name) ?? 'Unknown modifier',
    quantity: Math.max(1, Math.round(modifier.quantity ?? 1)),
    priceDeltaCents: readCents(modifier.price_delta, modifier.price, 0),
    specialInstructions: readString(modifier.special_instructions),
    children: [
      ...(modifier.modifiers ?? []),
      ...(modifier.selected_items ?? []),
    ].map((child) => parseUberModifier(child, externalId)),
  };
}

export function validateUberOrderAmounts(order: ParsedUberOrder) {
  return UberOrderStateMachine.validateAmounts(order);
}

export function mapUberEventTypeToOrderStatus(
  eventType: string,
): UberOrderStatus | null {
  return UberOrderStateMachine.eventStatus(eventType);
}

export function readString(...values: unknown[]): string | null {
  for (const value of values)
    if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}
export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function readCents(
  primary: unknown,
  fallback: unknown,
  defaultValue: number,
): number {
  const money = asObject(primary);
  const value =
    finite(primary) ??
    finite(money?.amount) ??
    finite(money?.value) ??
    finite(fallback) ??
    defaultValue;
  return Math.max(0, Math.round(value));
}
export function readOptionalCents(value: unknown): number | null {
  const money = asObject(value);
  const amount = finite(value) ?? finite(money?.amount) ?? finite(money?.value);
  return amount === null ? null : Math.max(0, Math.round(amount));
}
function finite(value: unknown): number | null {
  const parsed =
    typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}
function readDate(...values: unknown[]): Date | null {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}
function flattenModifiers(values: ParsedUberModifier[]): ParsedUberModifier[] {
  return values.flatMap((value) => [
    value,
    ...flattenModifiers(value.children),
  ]);
}
