import type { Channel } from '@shared/order';

export type ScheduledOrderSummaryDto = {
  orderStableId: string;
  orderNumber: string;
  channel: Channel;
  productionStartAt: string;
  scheduledFor: string;
  itemCount: number;
};

export type ScheduledOrdersQueueDto = {
  orders: ScheduledOrderSummaryDto[];
};
