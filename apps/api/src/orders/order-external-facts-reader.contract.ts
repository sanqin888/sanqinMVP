import type {
  Channel,
  OrderFulfillmentTiming,
  OrderStatus,
} from '@shared/order';

export const ORDER_EXTERNAL_FACTS_READER = Symbol(
  'ORDER_EXTERNAL_FACTS_READER',
);

export type ExternalOrderIdentity = Readonly<{
  channel: Channel;
  externalOrderId: string;
}>;

export type OrderExternalFacts = Readonly<{
  orderStableId: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  fulfillmentTiming: OrderFulfillmentTiming;
  externalEstimatedReadyAt: string | null;
}>;

export type OrderExternalSchedulingFacts = Readonly<{
  orderStableId: string;
  scheduledReadyAt: string | null;
  prepStartAt: string | null;
  prepDurationMinutes: number | null;
}>;

export type OrderExternalQueueFact = Readonly<{
  orderStableId: string;
  externalOrderId: string | null;
  pickupCode: string | null;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
}>;

export interface OrderExternalFactsReaderPort {
  findByExternalIdentity(
    identity: ExternalOrderIdentity,
  ): Promise<OrderExternalFacts | null>;

  existsByExternalIdentity(identity: ExternalOrderIdentity): Promise<boolean>;

  findSchedulingByOrderStableId(
    orderStableId: string,
  ): Promise<OrderExternalSchedulingFacts | null>;

  listByChannelAndStatuses(input: {
    channel: Channel;
    statuses: readonly OrderStatus[];
    limit: number;
  }): Promise<OrderExternalQueueFact[]>;

  summarizeByChannelAndStatuses(input: {
    channel: Channel;
    statuses: readonly OrderStatus[];
  }): Promise<{
    count: number;
    latestCreatedAt: string | null;
  }>;

  listReconciliationFacts(input: {
    channel: Channel;
    storeStableId: string;
    createdAtFrom: string;
    createdAtBefore: string;
  }): Promise<Array<{ status: OrderStatus; totalCents: number }>>;
}
