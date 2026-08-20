import type { Channel } from '@prisma/client';

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
