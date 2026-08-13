import { IsEnum } from 'class-validator';

/** Stable public API values. These deliberately do not expose persistence enums. */
export const OrderStatus = {
  pending: 'pending',
  paid: 'paid',
  making: 'making',
  ready: 'ready',
  completed: 'completed',
  refunded: 'refunded',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export class SyncOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
