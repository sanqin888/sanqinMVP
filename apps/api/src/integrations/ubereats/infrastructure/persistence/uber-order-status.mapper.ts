import { OrderStatus } from '@prisma/client';
import {
  UberOrderStatus,
  type UberOrderStatus as UberOrderStatusValue,
} from '../../domain/orders/uber-order.types';

const DOMAIN_TO_PRISMA: Record<UberOrderStatusValue, OrderStatus> = {
  [UberOrderStatus.pending]: OrderStatus.pending,
  [UberOrderStatus.paid]: OrderStatus.paid,
  [UberOrderStatus.making]: OrderStatus.making,
  [UberOrderStatus.ready]: OrderStatus.ready,
  [UberOrderStatus.completed]: OrderStatus.completed,
  [UberOrderStatus.refunded]: OrderStatus.refunded,
};

/** The persistence boundary is the only owner of domain/storage enum conversion. */
export const toPrismaOrderStatus = (
  status: UberOrderStatusValue,
): OrderStatus => DOMAIN_TO_PRISMA[status];

export const toUberOrderStatus = (status: OrderStatus): UberOrderStatusValue =>
  status;
