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

/**
 * Uber Order Fulfillment API 1.0.0 wire DTOs.
 * These types stay inside the UberEats bounded context; only ParsedUberOrder
 * crosses the application boundary into the generic Orders ingestion contract.
 */
export type UberOrderMoneyV1 = {
  amount_e5?: number;
  currency_code?: string;
  formatted?: string;
};

export type UberOrderMoneySummaryV1 = {
  display_amount?: string | number;
  net?: UberOrderMoneyV1;
  tax?: UberOrderMoneyV1;
  gross?: UberOrderMoneyV1;
  is_tax_inclusive?: boolean;
};

export type UberOrderQuantityV1 = {
  amount?: number;
  unit?: string;
  in_sellable_unit?: {
    amount_e5?: number;
  };
  in_priceable_unit?: {
    amount_e5?: number;
  };
};

export type UberOrderCartItemV1 = {
  id?: string;
  cart_item_id?: string;
  customer_id?: string;
  title?: string;
  external_data?: string;
  quantity?: UberOrderQuantityV1;
  default_quantity?: {
    amount?: number;
    unit?: string;
  };
  customer_request?: {
    allergy?: {
      allergens?: string[];
      instructions?: string;
    };
    special_instructions?: string;
  };
  selected_modifier_groups?: Array<{
    id?: string;
    title?: string;
    external_data?: string;
    selected_items?: UberOrderCartItemV1[];
  }>;
};

export type UberOrderPriceBreakdownV1 = {
  cart_item_id?: string;
  price_type?: string;
  quantity?: UberOrderQuantityV1;
  total?: UberOrderMoneySummaryV1;
  discount?: {
    total?: UberOrderMoneySummaryV1;
    quantity?: UberOrderQuantityV1;
  };
  unit?: UberOrderMoneySummaryV1;
  base_non_loyalty_unit?: UberOrderMoneySummaryV1;
};

export type UberOrderPaymentDetailV1 = {
  order_total?: UberOrderMoneySummaryV1;
  item_charges?: {
    total?: UberOrderMoneySummaryV1;
    subtotal_including_promos?: UberOrderMoneySummaryV1;
    price_breakdown?: UberOrderPriceBreakdownV1[];
  };
  fees?: {
    total?: UberOrderMoneySummaryV1;
    details?: Array<{
      id?: string;
      amount?: UberOrderMoneySummaryV1;
    }>;
  };
  promotions?: {
    total?: UberOrderMoneySummaryV1;
    details?: Array<{
      external_promotion_id?: string;
      type?: string;
      promotion_uuid?: string;
    }>;
    order_total_excluding_promos?: UberOrderMoneySummaryV1;
  };
  adjustment?: {
    total?: UberOrderMoneySummaryV1;
  };
};

export type UberOrderFulfillmentV1 = {
  id?: string;
  display_id?: string;
  external_id?: string;
  state?: string;
  status?: string;
  preparation_status?: string;
  ordering_platform?: string;
  fulfillment_type?: string;
  created_time?: string | number;
  completed_time?: string | number;
  store?: {
    id?: string;
    name?: string;
  };
  customers?: Array<{
    id?: string;
    name?: {
      display_name?: string;
      first_name?: string;
      last_name?: string;
    };
    phone?: string;
    phone_number?: string;
  }>;
  deliveries?: Array<{
    id?: string;
    status?: string;
    estimated_pick_up_time?: string;
    estimated_dropoff_time?: string;
  }>;
  carts?: Array<{
    id?: string;
    items?: UberOrderCartItemV1[];
    special_instructions?: string;
    include_single_use_items?: boolean;
  }>;
  payment?: {
    payment_detail?: UberOrderPaymentDetailV1;
  };
  preparation_time?: {
    ready_for_pickup_time_secs?: number;
    source?: string;
    ready_for_pickup_time?: string;
  };
  scheduled_order_target_delivery_time_range?: {
    start_time?: string;
    end_time?: string;
  };
};

/** Official Get Order response envelope for Order Fulfillment API 1.0.0. */
export type UberOrderDetailV1Response = {
  order: UberOrderFulfillmentV1;
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
  /** Parser always populates these; optionality preserves adapter test doubles. */
  fulfillmentTiming?: UberFulfillmentTiming;
  scheduledReadyAt?: Date | null;
  estimatedReadyAt: Date | null;
  specialInstructions: string | null;
  /** Parser always populates this; optionality preserves older adapter/test doubles. */
  allergyRequest?: {
    hasRequest: boolean;
    allergens: string[];
  };
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
