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
const PRISMA_TO_DOMAIN = Object.fromEntries(
  Object.entries(DOMAIN_TO_PRISMA).map(([domain, prisma]) => [prisma, domain]),
) as Record<OrderStatus, UberOrderStatusValue>;

/** The persistence boundary is the only owner of domain/storage enum conversion. */
export const toPrismaOrderStatus = (
  status: UberOrderStatusValue,
): OrderStatus => {
  const mapped = DOMAIN_TO_PRISMA[status];
  if (mapped === undefined)
    throw new Error(`Unknown Uber order domain status: ${String(status)}`);
  return mapped;
};

export const toUberOrderStatus = (
  status: OrderStatus,
): UberOrderStatusValue => {
  const mapped = PRISMA_TO_DOMAIN[status];
  if (mapped === undefined)
    throw new Error(`Unknown Prisma order status: ${String(status)}`);
  return mapped;
};
