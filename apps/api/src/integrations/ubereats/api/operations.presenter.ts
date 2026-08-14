import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
  type UberOperationStatus,
} from '../contracts/responses/ubereats.responses';
import type {
  UberOperationMutationResponse,
  UberOperationsSummaryResponse,
  UberOpsTicketListResponse,
  UberReconciliationReportListResponse,
} from '../contracts/responses/operations.responses';
import { dateOf } from './presenter.utils';

interface OperationsPage<T> {
  items: T[];
}

interface OpsTicketPresentation {
  ticketStableId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  externalOrderId: string | null;
  menuItemStableId: string | null;
  retryCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ReconciliationReportPresentation {
  reportStableId: string;
  totalOrders: number;
  totalAmountCents: number;
  syncedOrders: number;
  pendingOrders: number;
  failedSyncEvents: number;
  discrepancyOrders: number;
  rangeStart: Date;
  rangeEnd: Date;
  createdAt: Date;
}

export const presentOpsTickets = (
  result: OperationsPage<OpsTicketPresentation>,
): UberOpsTicketListResponse => {
  const items = result.items.map((ticket) => ({
    ticketStableId: ticket.ticketStableId,
    type: ticket.type,
    status: ticket.status,
    priority: ticket.priority,
    title: ticket.title,
    externalOrderId: ticket.externalOrderId,
    menuItemStableId: ticket.menuItemStableId,
    retryCount: ticket.retryCount,
    createdAt: dateOf(ticket.createdAt) ?? '',
    updatedAt: dateOf(ticket.updatedAt) ?? '',
  }));
  return toUberListResponse(items, 200);
};
export const presentReconciliationReports = (
  result: OperationsPage<ReconciliationReportPresentation>,
): UberReconciliationReportListResponse =>
  toUberListResponse(
    result.items.map((report) => ({
      ...report,
      rangeStart: report.rangeStart.toISOString(),
      rangeEnd: report.rangeEnd.toISOString(),
      createdAt: report.createdAt.toISOString(),
    })),
    100,
  );

export const presentOperationsSummary = (result: {
  count: number;
}): UberOperationsSummaryResponse => {
  return {
    total: result.count,
    succeeded: 0,
    failed: 0,
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentOperationMutation = (
  operationId: string,
  status: UberOperationStatus = 'SUCCEEDED',
): UberOperationMutationResponse => toUberMutationResponse(status, operationId);