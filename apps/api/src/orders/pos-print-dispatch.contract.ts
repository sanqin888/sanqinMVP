export const POS_PRINT_JOB_DISPATCH_REQUESTED =
  'orders.pos-print-job.dispatch-requested';

export type PosPrintJobDispatchRequest = {
  orderId: string;
  orderStableId: string;
  storeId: string;
  kind: string;
  data: unknown;
};

export type PosPrintJobDispatchResult = {
  jobId: string;
};
