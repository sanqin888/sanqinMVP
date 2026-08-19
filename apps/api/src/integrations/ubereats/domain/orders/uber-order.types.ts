/** UberEats domain status. Persistence adapters translate this to storage enums. */
export const UberOrderStatus = {
  pending: 'pending',
  paid: 'paid',
  making: 'making',
  ready: 'ready',
  completed: 'completed',
  refunded: 'refunded',
} as const;
export type UberOrderStatus =
  (typeof UberOrderStatus)[keyof typeof UberOrderStatus];

export type UberFulfillmentTiming = 'IMMEDIATE' | 'SCHEDULED';

type UberOrderMoneyDto =
  | number
  | string
  | { amount?: number; value?: number; amount_e5?: number };

type UberOrderItemPriceDto =
  | UberOrderMoneyDto
  | {
      unit_price?: UberOrderMoneyDto;
      total_price?: UberOrderMoneyDto;
      amount_e5?: number;
    };

type UberOrderQuantityDto = number | { amount?: number };

export type UberOrderModifierDto = {
  id?: string;
  modifier_id?: string;
  title?: string;
  name?: string;
  quantity?: UberOrderQuantityDto;
  price?: UberOrderMoneyDto;
  price_delta?: UberOrderMoneyDto;
  special_instructions?: string;
  modifiers?: UberOrderModifierDto[];
  selected_items?: UberOrderModifierDto[];
};

export type UberOrderItemDto = {
  id?: string;
  instance_id?: string;
  line_item_id?: string;
  cart_item_id?: string;
  item_id?: string;
  external_data?: string;
  title?: string;
  name?: string;
  quantity?: UberOrderQuantityDto;
  price?: UberOrderItemPriceDto;
  unit_price?: UberOrderMoneyDto;
  total_price?: UberOrderMoneyDto;
  special_instructions?: string;
  modifiers?: UberOrderModifierDto[];
  selected_modifier_groups?: Array<{
    id?: string;
    title?: string;
    selected_items?: UberOrderModifierDto[];
  }>;
};

export type UberOrderDetailDto = {
  /** Order Fulfillment API v1 wraps the MerchantOrder in an `order` field. */
  order?: UberOrderDetailDto;
  id?: string;
  order_id?: string;
  external_id?: string;
  external_order_id?: string;
  display_id?: string;
  pickup_code?: string;
  state?: string;
  status?: string;
  preparation_status?: string;
  store_id?: string;
  store?: {
    id?: string;
  };
  subtotal?: UberOrderMoneyDto;
  sub_total?: UberOrderMoneyDto;
  subtotal_cents?: number;
  tax?: UberOrderMoneyDto;
  tax_cents?: number;
  total?: UberOrderMoneyDto;
  total_cents?: number;
  discount?: UberOrderMoneyDto;
  discount_cents?: number;
  discountCents?: number;
  delivery_fee?: UberOrderMoneyDto;
  payment?: {
    charges?: {
      total?: UberOrderMoneyDto;
      sub_total?: UberOrderMoneyDto;
      subtotal?: UberOrderMoneyDto;
      tax?: UberOrderMoneyDto;
      delivery_fee?: UberOrderMoneyDto;
      total_fee?: UberOrderMoneyDto;
      total_promo_applied?: UberOrderMoneyDto;
      sub_total_promo_applied?: UberOrderMoneyDto;
      tax_promo_applied?: UberOrderMoneyDto;
    };
    promotions?: {
      promotions?: Array<{
        promo_discount_value?: number;
        promo_delivery_fee_value?: number;
      }>;
    } | null;
  };
  items?: UberOrderItemDto[];
  cart?: { items?: UberOrderItemDto[]; special_instructions?: string };
  carts?: Array<{ items?: UberOrderItemDto[] }>;
  customer?: {
    name?: string;
    full_name?: string;
    phone?: string;
    phone_number?: string;
  };
  customers?: Array<{
    name?: {
      display_name?: string;
      first_name?: string;
      last_name?: string;
    };
    phone?: string;
    phone_number?: string;
  }>;
  eater?: {
    first_name?: string;
    last_name?: string;
    name?: string;
    full_name?: string;
    phone?: string;
    phone_number?: string;
  };
  fulfillment_type?: string;
  type?: string;
  estimated_ready_for_pickup_at?: string;
  estimated_delivery_at?: string;
  scheduled_ready_for_pickup_at?: string;
  scheduled_order_target_delivery_time_range?: {
    start_time?: string;
    end_time?: string;
  };
  special_instructions?: string;
  paid_at?: string;
  created_at?: string;
  placed_at?: string;
  cancelled_at?: string;
  canceled_at?: string;
  cancellation?: {
    cancelled_by?: string;
    canceled_by?: string;
    reason?: string;
    reason_code?: string;
    details?: string;
  };
};

export type ParsedUberModifier = {
  externalId: string | null;
  parentExternalId: string | null;
  displayName: string;
  quantity: number;
  priceDeltaCents: number;
  specialInstructions: string | null;
  children: ParsedUberModifier[];
};

export type ParsedUberOrderItem = {
  externalLineId: string | null;
  externalItemId: string | null;
  stableIdHint: string | null;
  displayName: string;
  quantity: number;
  baseUnitPriceCents: number;
  optionsUnitPriceCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
  specialInstructions: string | null;
  modifiers: ParsedUberModifier[];
};

export type ParsedUberOrder = {
  externalOrderId: string;
  displayId: string | null;
  pickupCode: string | null;
  uberStoreId?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  discountCents: number;
  hasPromotion: boolean;
  deliveryFeeCents: number;
  fulfillmentType: 'pickup' | 'delivery';
  /** Parser always populates these; optionality preserves legacy adapter fixtures. */
  fulfillmentTiming?: UberFulfillmentTiming;
  scheduledReadyAt?: Date | null;
  estimatedReadyAt: Date | null;
  specialInstructions: string | null;
  items: ParsedUberOrderItem[];
  contactName?: string | null;
  contactPhone?: string | null;
  paidAt: Date;
  cancellation: {
    cancelledBy: string | null;
    reasonCode: string | null;
    reasonDetail: string | null;
    occurredAt: Date;
  } | null;
};

export type UberOrderActionName =
  | 'ACCEPT'
  | 'DENY'
  | 'CANCEL'
  | 'READY_FOR_PICKUP';

export const UBER_ACTION_BY_LOCAL_STATUS: Partial<
  Record<UberOrderStatus, UberOrderActionName>
> = {
  [UberOrderStatus.ready]: 'READY_FOR_PICKUP',
};

export type UberOrderActionRecord = {
  id: string;
  externalOrderId: string;
  action: UberOrderActionName;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'DEAD';
  retryable: boolean;
  uberHttpStatus: number | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  lastError?: string | null;
  attemptCount?: number;
  leaseToken?: string | null;
  nextRetryAt?: Date | null;
};

export type UberOrderActionResult = {
  ok: boolean;
  action: UberOrderActionName;
  actionId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'DEAD';
  retryable: boolean;
  duplicate: boolean;
  uberHttpStatus?: number | null;
  errorSummary?: string;
};

export type UberDenyReasonCode =
  | 'STORE_CLOSED'
  | 'POS_NOT_READY'
  | 'POS_OFFLINE'
  | 'ITEM_AVAILABILITY'
  | 'MISSING_ITEM'
  | 'MISSING_INFO'
  | 'PRICING'
  | 'CAPACITY'
  | 'ADDRESS'
  | 'SPECIAL_INSTRUCTIONS'
  | 'OTHER';
