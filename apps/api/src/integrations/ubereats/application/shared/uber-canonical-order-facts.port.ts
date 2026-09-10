import type {
  UberFulfillmentTiming,
  UberOrderStatus,
} from '../../domain/orders/uber-order.types';

export const UBER_CANONICAL_ORDER_FACTS_QUERY = Symbol(
  'UBER_CANONICAL_ORDER_FACTS_QUERY',
);

export type UberCanonicalOrderFacts = {
  orderStableId: string;
  status: UberOrderStatus;
  totalCents: number;
  referenceAt: Date;
  fulfillmentTiming: UberFulfillmentTiming;
  externalEstimatedReadyAt: Date | null;
};

export type UberCanonicalOrderSchedulingFacts = {
  orderStableId: string;
  scheduledReadyAt: Date | null;
  prepStartAt: Date | null;
  prepDurationMinutes: number | null;
};

export interface UberCanonicalOrderFactsQueryPort {
  findByExternalOrderId(
    externalOrderId: string,
  ): Promise<UberCanonicalOrderFacts | null>;

  findSchedulingByOrderStableId(
    orderStableId: string,
  ): Promise<UberCanonicalOrderSchedulingFacts | null>;
}
