export const ORDER_PRINT_HANDOFF_REQUESTED = 'orders.print-handoff.requested';

export type OrderPrintPurpose =
  | 'INITIAL'
  | 'REPRINT'
  | 'AMENDMENT'
  | 'CANCELLATION';

export type OrderPrintTargets = {
  customer?: boolean;
  kitchen?: boolean;
  label?: boolean;
};

/**
 * Orders/Fulfillment output contract. The caller supplies a stable Order snapshot
 * and the business purpose only; Print owns the durable job identity and routing.
 */
export type OrderPrintHandoffRequest = {
  orderId: string;
  orderStableId: string;
  storeStableId: string;
  purpose: OrderPrintPurpose;
  data: unknown;
  requestedTargets?: OrderPrintTargets;
};

export type OrderPrintHandoffResult = {
  jobId: string;
};
