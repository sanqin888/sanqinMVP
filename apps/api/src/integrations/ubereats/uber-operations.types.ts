import type {
  Prisma,
  UberOpsTicketPriority,
  UberOpsTicketType,
} from '@prisma/client';

export type GenerateReconciliationReportInput = UberStoreScopedInput & {
  rangeStart?: string;
  rangeEnd?: string;
};

export type CreateOpsTicketInput = {
  storeId?: string;
  type: UberOpsTicketType;
  title: string;
  description?: string;
  priority?: UberOpsTicketPriority;
  externalOrderId?: string;
  menuItemStableId?: string;
  context?: Prisma.JsonObject;
};
