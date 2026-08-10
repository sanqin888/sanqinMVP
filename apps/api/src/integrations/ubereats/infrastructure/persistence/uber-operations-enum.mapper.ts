import {
  UberOpsTicketPriority as PrismaTicketPriority,
  UberOpsTicketStatus as PrismaTicketStatus,
  UberOpsTicketType as PrismaTicketType,
} from '@prisma/client';
import type {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '../../domain/operations/uber-operations.types';

const invert = <K extends string, V extends string>(mapping: Record<K, V>) =>
  Object.fromEntries(
    Object.entries(mapping).map(([key, value]) => [value, key]),
  ) as Record<V, K>;
const required = <T>(
  value: T | undefined,
  label: string,
  input: unknown,
): T => {
  if (value === undefined)
    throw new Error(`Unknown ${label}: ${String(input)}`);
  return value;
};

const TYPE_TO_PRISMA: Record<UberOpsTicketType, PrismaTicketType> = {
  ORDER_STATUS_SYNC: PrismaTicketType.ORDER_STATUS_SYNC,
  MENU_ITEM_AVAILABILITY: PrismaTicketType.MENU_ITEM_AVAILABILITY,
  STORE_STATUS_SYNC: PrismaTicketType.STORE_STATUS_SYNC,
  MENU_PUBLISH: PrismaTicketType.MENU_PUBLISH,
  RECONCILIATION: PrismaTicketType.RECONCILIATION,
};
const STATUS_TO_PRISMA: Record<UberOpsTicketStatus, PrismaTicketStatus> = {
  OPEN: PrismaTicketStatus.OPEN,
  IN_PROGRESS: PrismaTicketStatus.IN_PROGRESS,
  RESOLVED: PrismaTicketStatus.RESOLVED,
  CLOSED: PrismaTicketStatus.CLOSED,
  IGNORED: PrismaTicketStatus.IGNORED,
};
const PRIORITY_TO_PRISMA: Record<UberOpsTicketPriority, PrismaTicketPriority> =
  {
    LOW: PrismaTicketPriority.LOW,
    MEDIUM: PrismaTicketPriority.MEDIUM,
    HIGH: PrismaTicketPriority.HIGH,
    CRITICAL: PrismaTicketPriority.CRITICAL,
  };
const PRISMA_TO_TYPE = invert(TYPE_TO_PRISMA);
const PRISMA_TO_STATUS = invert(STATUS_TO_PRISMA);
const PRISMA_TO_PRIORITY = invert(PRIORITY_TO_PRISMA);

export const toPrismaTicketType = (value: UberOpsTicketType) =>
  required(TYPE_TO_PRISMA[value], 'Uber ticket type', value);
export const toDomainTicketType = (value: PrismaTicketType) =>
  required(PRISMA_TO_TYPE[value], 'Prisma ticket type', value);
export const toPrismaTicketStatus = (value: UberOpsTicketStatus) =>
  required(STATUS_TO_PRISMA[value], 'Uber ticket status', value);
export const toDomainTicketStatus = (value: PrismaTicketStatus) =>
  required(PRISMA_TO_STATUS[value], 'Prisma ticket status', value);
export const toPrismaTicketPriority = (value: UberOpsTicketPriority) =>
  required(PRIORITY_TO_PRISMA[value], 'Uber ticket priority', value);
export const toDomainTicketPriority = (value: PrismaTicketPriority) =>
  required(PRISMA_TO_PRIORITY[value], 'Prisma ticket priority', value);
