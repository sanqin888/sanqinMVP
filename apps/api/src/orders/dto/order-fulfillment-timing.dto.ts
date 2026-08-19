import type { OrderFulfillmentTiming, OrderStatus } from '@prisma/client';

export type OrderFulfillmentTimingDto = {
  orderStableId: string;
  status: OrderStatus;
  fulfillmentTiming: OrderFulfillmentTiming;
  scheduledReadyAt: string | null;
  prepStartAt: string | null;
  prepDurationMinutes: number | null;
  scheduleActivatedAt: string | null;
  externalEstimatedReadyAt: string | null;
};
