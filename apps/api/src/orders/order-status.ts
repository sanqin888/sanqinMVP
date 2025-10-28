import { OrderStatus } from '@prisma/client';

export { OrderStatus };

export const ORDER_STATUS_SEQUENCE: readonly OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
  OrderStatus.completed,
  OrderStatus.refunded,
] as const;

export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending: [OrderStatus.paid],
  paid: [OrderStatus.making, OrderStatus.refunded],
  making: [OrderStatus.ready, OrderStatus.refunded],
  ready: [OrderStatus.completed],
  completed: [],
  refunded: [],
} as const;

export const ORDER_STATUS_ADVANCE_FLOW: Readonly<
  Record<OrderStatus, OrderStatus | null>
> = {
  pending: OrderStatus.paid,
  paid: OrderStatus.making,
  making: OrderStatus.ready,
  ready: OrderStatus.completed,
  completed: null,
  refunded: null,
} as const;
