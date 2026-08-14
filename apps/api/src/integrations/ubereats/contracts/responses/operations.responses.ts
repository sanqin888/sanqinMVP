import type {
  UberListResponse,
  UberMutationResponse,
} from './ubereats.responses';

export class UberOpsTicketResponse {
  ticketStableId!: string;
  type!: string;
  status!: string;
  priority!: string;
  title!: string;
  externalOrderId!: string | null;
  menuItemStableId!: string | null;
  retryCount!: number;
  createdAt!: string;
  updatedAt!: string;
}
export type UberOpsTicketListResponse = UberListResponse<UberOpsTicketResponse>;
export type UberOperationMutationResponse = UberMutationResponse;
export class UberOperationsSummaryResponse {
  total!: number;
  succeeded!: number;
  failed!: number;
  contractVersion!: '2';
}

export class UberReconciliationReportResponse {
  reportStableId!: string;
  totalOrders!: number;
  totalAmountCents!: number;
  syncedOrders!: number;
  pendingOrders!: number;
  failedSyncEvents!: number;
  discrepancyOrders!: number;
  rangeStart!: string;
  rangeEnd!: string;
  createdAt!: string;
}
export type UberReconciliationReportListResponse =
  UberListResponse<UberReconciliationReportResponse>;
