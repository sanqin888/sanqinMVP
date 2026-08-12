import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberOperationMutationResponse,
  UberOperationsSummaryResponse,
  UberOpsTicketListResponse,
  UberReconciliationReportListResponse,
} from '../contracts/responses/operations.responses';
import type {
  UberOperationsPage,
  UberOperationsSummaryView,
  UberOperationsTicketView,
  UberReconciliationReportView,
} from '../application/operations/uber-operations.use-cases';
import { dateOf } from './presenter.utils';

export const presentOpsTickets = (
  result: UberOperationsPage<UberOperationsTicketView>,
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
  result: UberOperationsPage<UberReconciliationReportView>,
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

export const presentOperationsSummary = (
  result: UberOperationsSummaryView,
): UberOperationsSummaryResponse => {
  return {
    total: result.count,
    succeeded: 0,
    failed: 0,
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentOperationMutation = (): UberOperationMutationResponse =>
  toUberMutationResponse();
