export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'making'
  | 'ready'
  | 'completed'
  | 'refunded';

export const ORDER_STATUS_SEQUENCE: readonly OrderStatus[] = [
  'pending',
  'paid',
  'making',
  'ready',
  'completed',
  'refunded',
] as const;

export const ORDER_STATUS_ADVANCE: Readonly<
  Record<OrderStatus, OrderStatus | null>
> = {
  pending: 'paid',
  paid: 'making',
  making: 'ready',
  ready: 'completed',
  completed: null,
  refunded: null,
} as const;
