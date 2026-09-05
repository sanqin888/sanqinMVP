import type {
  Channel,
  FulfillmentType,
  OrderFulfillmentTiming,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

export const ORDER_INGESTION = Symbol('ORDER_INGESTION');

export type NormalizedOrderItem = {
  productStableId: string;
  quantity: number;
  displayName: string;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents: number;
  baseUnitPriceCents?: number | null;
  optionsUnitPriceCents?: number | null;
  options?: Prisma.InputJsonValue;
  external?: {
    itemId?: string | null;
    lineId?: string | null;
    instructions?: string | null;
    lineTotalCents?: number | null;
    publishedPriceCents?: number | null;
    channelBasePriceCents?: number | null;
    priceVarianceCents?: number | null;
    modifiers?: Array<{
      externalId: string | null;
      parentExternalId: string | null;
      displayName: string;
      quantity: number;
      priceDeltaCents: number;
      specialInstructions: string | null;
      snapshot: Prisma.InputJsonValue;
    }>;
  };
};

/** Channel switches are deliberately explicit: an external adapter must opt in. */
export type OrderIngestionPolicies = {
  verifyWebPayment: boolean;
  applyMembershipPoints: boolean;
  applyCoupons: boolean;
  persistExternalSnapshot: boolean;
};

export type NormalizedOrderInput = {
  channel: Channel;
  paymentMethod: PaymentMethod;
  externalOrderId?: string | null;
  clientRequestId: string;
  storeStableId?: string | null;
  status: OrderStatus;
  paidAt: Date;
  fulfillmentType: FulfillmentType;
  fulfillmentTiming?: OrderFulfillmentTiming;
  scheduledReadyAt?: Date | null;
  pickupCode?: string | null;
  amounts: {
    subtotalCents: number;
    subtotalAfterDiscountCents: number;
    couponDiscountCents: number;
    taxCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    paymentTotalCents: number;
  };
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  externalSnapshot?: {
    displayId?: string | null;
    notes?: string | null;
    estimatedReadyAt?: Date | null;
    priceVarianceCents?: number;
  };
  items: NormalizedOrderItem[];
};

export type IngestionResult = {
  action: 'created' | 'updated';
  status: OrderStatus;
  orderId: string;
  orderStableId: string;
};

/**
 * Cross-context persistence extensions may participate in the same transaction
 * as the canonical Order write. This preserves the existing atomic ingestion
 * semantics while keeping the concrete ingestion service private to Orders.
 */
export type OrderIngestionWithinTransaction = (
  tx: Prisma.TransactionClient,
  result: IngestionResult,
) => Promise<void>;

export interface OrderIngestionPort {
  ingest(
    input: NormalizedOrderInput,
    policies: OrderIngestionPolicies,
    withinTransaction?: OrderIngestionWithinTransaction,
  ): Promise<IngestionResult>;
}
