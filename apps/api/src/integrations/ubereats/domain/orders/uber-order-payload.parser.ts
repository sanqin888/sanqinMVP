import { normalizeUberEventType } from '../webhook/uber-event-type';
import { UberOrderStateMachine } from './uber-order.state-machine';
import type {
  ParsedUberModifier,
  ParsedUberOrder,
  ParsedUberOrderItem,
  UberOrderCartItemV1,
  UberOrderFulfillmentV1,
  UberOrderMoneySummaryV1,
  UberOrderPriceBreakdownV1,
  UberOrderStatus,
} from './uber-order.types';

export type UberOrderPayloadParseResult =
  | { kind: 'parsed'; order: ParsedUberOrder }
  | {
      kind: 'invalid';
      reason:
        | 'MALFORMED_PAYLOAD'
        | 'MISSING_ORDER_ID'
        | 'MISSING_TOTAL'
        | 'EMPTY_ITEMS'
        | 'MISSING_SCHEDULED_READY_AT';
      category: 'mapping' | 'business';
    };

type ParseContext = { eventType?: string };
type PriceIndex = Map<string, UberOrderPriceBreakdownV1>;

/** Strict mapper for Uber Order Fulfillment API 1.0.0 Get Order responses. */
export class UberOrderPayloadParser {
  parse(payload: unknown, context?: ParseContext): ParsedUberOrder | null {
    const result = this.parseResult(payload, context);
    return result.kind === 'parsed' ? result.order : null;
  }

  parseResult(
    payload: unknown,
    context?: ParseContext,
  ): UberOrderPayloadParseResult {
    const dto = readMerchantOrder(payload);
    if (!dto) return invalid('MALFORMED_PAYLOAD', 'mapping');

    const externalOrderId = readString(dto.id);
    if (!externalOrderId) return invalid('MISSING_ORDER_ID', 'mapping');
    if (!Array.isArray(dto.carts))
      return invalid('MALFORMED_PAYLOAD', 'mapping');
    if (dto.carts.some((cart) => !asObject(cart) || !Array.isArray(cart.items)))
      return invalid('MALFORMED_PAYLOAD', 'mapping');

    const wireItems = dto.carts.flatMap((cart) => cart.items ?? []);
    if (wireItems.length === 0) return invalid('EMPTY_ITEMS', 'business');
    if (wireItems.some((item) => !isCartItem(item)))
      return invalid('MALFORMED_PAYLOAD', 'mapping');

    const paymentDetail = dto.payment?.payment_detail;
    const orderTotal = paymentDetail?.order_total;
    const itemCharges = paymentDetail?.item_charges;
    if (
      !orderTotal ||
      !itemCharges ||
      !Array.isArray(itemCharges.price_breakdown)
    )
      return invalid('MISSING_TOTAL', 'mapping');
    const totalCents = summaryGrossCents(orderTotal);
    if (totalCents === null) return invalid('MISSING_TOTAL', 'mapping');

    const priceIndex = buildPriceIndex(itemCharges.price_breakdown);
    const parsedItems = wireItems.map((item) =>
      parseUberOrderItemV1(item, priceIndex),
    );
    if (parsedItems.some((item) => item === null))
      return invalid('MALFORMED_PAYLOAD', 'mapping');
    const items = parsedItems.filter(
      (item): item is ParsedUberOrderItem => item !== null,
    );

    const scheduled =
      normalizeUberEventType(context?.eventType ?? '') ===
      'orders.scheduled.notification';
    const externalReadyAt = readDate(
      dto.preparation_time?.ready_for_pickup_time,
    );
    const scheduledReadyAt = scheduled ? externalReadyAt : null;
    if (scheduled && !scheduledReadyAt)
      return invalid('MISSING_SCHEDULED_READY_AT', 'mapping');

    const calculatedSubtotalCents = items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );
    const subtotalCents =
      summaryNetOrGrossCents(itemCharges.total) ?? calculatedSubtotalCents;
    const subtotalAfterPromosCents =
      summaryNetOrGrossCents(itemCharges.subtotal_including_promos) ??
      subtotalCents;
    const discountCents = Math.max(0, subtotalCents - subtotalAfterPromosCents);
    const taxCents = moneyCents(orderTotal.tax) ?? 0;
    const deliveryFeeCents =
      summaryNetOrGrossCents(paymentDetail.fees?.total) ?? 0;
    const customer = dto.customers?.[0];
    const customerName = [
      readString(customer?.name?.first_name),
      readString(customer?.name?.last_name),
    ]
      .filter((value): value is string => value !== null)
      .join(' ');
    const cartNotes = dto.carts
      .map((cart) => readString(cart.special_instructions))
      .filter((value): value is string => value !== null);

    return {
      kind: 'parsed',
      order: {
        externalOrderId,
        displayId: readString(dto.display_id),
        pickupCode: readString(dto.display_id),
        uberStoreId: readString(dto.store?.id),
        subtotalCents,
        taxCents,
        totalCents,
        discountCents,
        hasPromotion:
          discountCents > 0 ||
          (paymentDetail.promotions?.details?.length ?? 0) > 0,
        deliveryFeeCents,
        contactName: readString(
          customer?.name?.display_name,
          customerName || null,
        ),
        contactPhone: readString(customer?.phone, customer?.phone_number),
        paidAt: readDate(dto.created_time) ?? new Date(),
        fulfillmentType: readString(dto.fulfillment_type)
          ?.toLowerCase()
          .includes('deliver')
          ? 'delivery'
          : 'pickup',
        fulfillmentTiming: scheduled ? 'SCHEDULED' : 'IMMEDIATE',
        scheduledReadyAt,
        estimatedReadyAt: externalReadyAt,
        specialInstructions: cartNotes.length ? cartNotes.join('\n') : null,
        cancellation: null,
        items,
      },
    };
  }
}

function invalid(
  reason: Extract<UberOrderPayloadParseResult, { kind: 'invalid' }>['reason'],
  category: Extract<
    UberOrderPayloadParseResult,
    { kind: 'invalid' }
  >['category'],
): UberOrderPayloadParseResult {
  return { kind: 'invalid', reason, category };
}

function readMerchantOrder(payload: unknown): UberOrderFulfillmentV1 | null {
  const root = asObject(payload);
  const order = asObject(root?.order);
  return order ? (order as UberOrderFulfillmentV1) : null;
}

function buildPriceIndex(values: UberOrderPriceBreakdownV1[]): PriceIndex {
  const index: PriceIndex = new Map();
  for (const value of values) {
    const id = readString(value.cart_item_id);
    if (id) index.set(id, value);
  }
  return index;
}

export function parseUberOrderItemV1(
  item: UberOrderCartItemV1,
  priceIndex: PriceIndex,
): ParsedUberOrderItem | null {
  const cartItemId = readString(item.cart_item_id);
  const externalItemId = readString(item.id);
  if (!cartItemId || !externalItemId) return null;
  const price = priceIndex.get(cartItemId);
  if (!price) return null;
  const quantity = readQuantity(item.quantity);
  const baseUnitPriceCents = breakdownUnitCents(price);
  if (baseUnitPriceCents === null) return null;

  const modifiers = (item.selected_modifier_groups ?? []).flatMap((group) =>
    (group.selected_items ?? []).map((selected) =>
      parseUberModifierV1(selected, readString(group.id), priceIndex),
    ),
  );
  if (modifiers.some((modifier) => modifier === null)) return null;
  const parsedModifiers = modifiers.filter(
    (modifier): modifier is ParsedUberModifier => modifier !== null,
  );
  const optionsUnitPriceCents = flattenModifiers(parsedModifiers).reduce(
    (sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity,
    0,
  );
  const unitPriceCents = baseUnitPriceCents + optionsUnitPriceCents;

  return {
    externalLineId: cartItemId,
    externalItemId,
    stableIdHint: readString(item.external_data),
    displayName: readString(item.title) ?? 'Unknown Uber item',
    quantity,
    baseUnitPriceCents,
    optionsUnitPriceCents,
    unitPriceCents,
    lineTotalCents: unitPriceCents * quantity,
    specialInstructions: readString(
      item.customer_requests?.special_instructions,
    ),
    modifiers: parsedModifiers,
  };
}

function parseUberModifierV1(
  item: UberOrderCartItemV1,
  parentExternalId: string | null,
  priceIndex: PriceIndex,
): ParsedUberModifier | null {
  const cartItemId = readString(item.cart_item_id);
  if (!cartItemId) return null;
  const price = priceIndex.get(cartItemId);
  if (!price) return null;
  const priceDeltaCents = breakdownUnitCents(price);
  if (priceDeltaCents === null) return null;
  const externalId = readString(item.id);
  const children = (item.selected_modifier_groups ?? []).flatMap((group) =>
    (group.selected_items ?? []).map((selected) =>
      parseUberModifierV1(selected, externalId ?? parentExternalId, priceIndex),
    ),
  );
  if (children.some((child) => child === null)) return null;
  return {
    externalId,
    parentExternalId,
    displayName: readString(item.title) ?? 'Unknown modifier',
    quantity: readQuantity(item.quantity),
    priceDeltaCents,
    specialInstructions: readString(
      item.customer_requests?.special_instructions,
    ),
    children: children.filter(
      (child): child is ParsedUberModifier => child !== null,
    ),
  };
}

function breakdownUnitCents(value: UberOrderPriceBreakdownV1): number | null {
  const preferred =
    summaryNetOrGrossCents(value.base_non_loyalty_unit) ??
    summaryNetOrGrossCents(value.unit);
  if (preferred !== null) return preferred;
  const total = summaryNetOrGrossCents(value.total);
  if (total === null) return null;
  return Math.round(total / readQuantity(value.quantity));
}

function isCartItem(value: unknown): value is UberOrderCartItemV1 {
  const item = asObject(value);
  if (!item) return false;
  if (item.selected_modifier_groups !== undefined) {
    if (!Array.isArray(item.selected_modifier_groups)) return false;
    for (const groupValue of item.selected_modifier_groups) {
      const group = asObject(groupValue);
      if (!group || !Array.isArray(group.selected_items)) return false;
      if (group.selected_items.some((selected) => !isCartItem(selected)))
        return false;
    }
  }
  return true;
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

function summaryGrossCents(value: UberOrderMoneySummaryV1): number | null {
  return moneyCents(value.gross);
}

function summaryNetOrGrossCents(
  value: UberOrderMoneySummaryV1 | undefined,
): number | null {
  if (!value) return null;
  return moneyCents(value.net) ?? moneyCents(value.gross);
}

function moneyCents(value: unknown): number | null {
  const money = asObject(value);
  const amountE5 = finite(money?.amount_e5);
  return amountE5 === null ? null : Math.max(0, Math.round(amountE5 / 1_000));
}

function readQuantity(value: unknown): number {
  const object = asObject(value);
  const quantity = finite(object?.amount) ?? 1;
  return Math.max(1, Math.round(quantity));
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
