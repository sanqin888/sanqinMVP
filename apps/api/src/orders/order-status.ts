import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_SEQUENCE,
  OrderStatus,
} from '@shared/order';

export type { OrderStatus };
export { ORDER_STATUS_SEQUENCE };

export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending: ['paid', 'refunded'],
  paid: ['making', 'refunded'],
  making: ['ready', 'refunded'],
  ready: ['completed'],
  completed: ['refunded'],
  refunded: [],
} as const;

export const ORDER_STATUS_ADVANCE_FLOW = ORDER_STATUS_FLOW;
