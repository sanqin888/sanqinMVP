import type {
  CreateOrderInput,
  OrderStatus,
  PaymentMethod,
} from '@shared/order';
import type { OrderDto } from './dto/order.dto';
import type { OrderFulfillmentTimingDto } from './dto/order-fulfillment-timing.dto';
import type { ScheduledOrderSummaryDto } from './dto/scheduled-order-summary.dto';

export const POS_ORDER_OPERATIONS = Symbol('POS_ORDER_OPERATIONS');

export type PosOrderBoardQuery = {
  statusIn?: OrderStatus[];
  channelIn?: Array<'web' | 'in_store' | 'ubereats'>;
  limit?: number;
  sinceMinutes?: number;
  requireItems?: boolean;
};

export type PosOrderJsonPrimitive = string | number | boolean | null;
export type PosOrderJsonNestedValue =
  | PosOrderJsonPrimitive
  | PosOrderJsonNestedValue[]
  | { [key: string]: PosOrderJsonNestedValue };
export type PosOrderJsonInput = Exclude<PosOrderJsonNestedValue, null>;

export type PosOrderAmendmentType =
  | 'RETENDER'
  | 'VOID_ITEM'
  | 'SWAP_ITEM'
  | 'ADDITIONAL_CHARGE';
export type PosOrderAmendmentItemAction = 'VOID' | 'ADD';

export type PosOrderAmendmentInput = {
  orderStableId: string;
  type: PosOrderAmendmentType;
  reason: string;
  items?: Array<{
    action: PosOrderAmendmentItemAction;
    productStableId: string;
    qty: number;
    unitPriceCents?: number | null;
    displayName?: string | null;
    nameEn?: string | null;
    nameZh?: string | null;
    optionsJson?: PosOrderJsonInput;
  }>;
  paymentMethod?: PaymentMethod | null;
  refundGrossCents?: number;
  additionalChargeCents?: number;
};

export type PosOrderFullRefundInput = {
  orderStableId: string;
  reason: string;
  refundAmountCents: number;
  originalPaymentMethod: PaymentMethod;
  refundMethod: PaymentMethod;
};

export type PosOrderFullRefundResult = {
  order: OrderDto;
  outcome: 'pending_platform' | 'pending_manual' | 'refunded';
};

export interface PosOrderOperationsPort {
  createForStore(
    dto: CreateOrderInput,
    storeStableId: string,
  ): Promise<OrderDto>;
  recent(storeStableId: string, limit?: number): Promise<OrderDto[]>;
  board(storeStableId: string, query: PosOrderBoardQuery): Promise<OrderDto[]>;
  getByStableIdForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderDto>;
  updateStatusForStore(
    orderStableId: string,
    storeStableId: string,
    status: OrderStatus,
  ): Promise<OrderDto>;
  advanceForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderDto>;
  getExternalPaymentCents(orderStableId: string): Promise<number | null>;
  createAmendment(input: PosOrderAmendmentInput): Promise<OrderDto>;
  createFullRefund(
    input: PosOrderFullRefundInput,
  ): Promise<PosOrderFullRefundResult>;
  listUpcomingScheduledForStore(
    storeStableId: string,
  ): Promise<ScheduledOrderSummaryDto[]>;
  getFulfillmentTimingForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderFulfillmentTimingDto | null>;
  getFulfillmentTimingsForStore(
    orderStableIds: string[],
    storeStableId: string,
  ): Promise<Map<string, 'IMMEDIATE' | 'SCHEDULED'>>;
  activateScheduledPreparation(
    orderStableId: string,
    storeStableId: string,
  ): Promise<void>;
}

export type {
  OrderDto as PosOrderDto,
  OrderFulfillmentTimingDto as PosOrderFulfillmentTimingDto,
  ScheduledOrderSummaryDto as PosScheduledOrderSummaryDto,
};
