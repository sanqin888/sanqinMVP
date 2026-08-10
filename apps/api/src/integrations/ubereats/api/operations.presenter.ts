import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type { UberOpsTicketListResponse } from '../contracts/responses/operations.responses';
import { dateOf, numberOf, recordOf, textOf } from './presenter.utils';

export const presentOpsTickets = (
  result: unknown,
): UberOpsTicketListResponse => {
  const source = recordOf(result);
  const items = Array.isArray(source.items)
    ? source.items.map((value) => {
        const ticket = recordOf(value);
        return {
          ticketStableId: textOf(ticket.ticketStableId) ?? '',
          type: textOf(ticket.type) ?? '',
          status: textOf(ticket.status) ?? '',
          priority: textOf(ticket.priority) ?? '',
          title: textOf(ticket.title) ?? '',
          externalOrderId: textOf(ticket.externalOrderId),
          menuItemStableId: textOf(ticket.menuItemStableId),
          retryCount: numberOf(ticket.retryCount),
          createdAt: dateOf(ticket.createdAt) ?? '',
          updatedAt: dateOf(ticket.updatedAt) ?? '',
        };
      })
    : [];
  return toUberListResponse(items, 200);
};
export const presentOperationsSummary = (result: unknown) => {
  const source = recordOf(result);
  return {
    total: numberOf(source.total ?? source.count),
    succeeded: numberOf(source.succeeded),
    failed: numberOf(source.failed),
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentOperationMutation = () => toUberMutationResponse();
