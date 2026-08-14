import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberOrderMutationResponse,
  UberOrderSummaryResponse,
  UberOrdersListResponse,
} from '../contracts/responses/orders.responses';
import type {
  PendingUberOrdersResult,
  PendingUberOrdersSummary,
} from '../application/orders/list-pending-uber-orders.query';
import { dateOf } from './presenter.utils';

export const presentPendingOrders = (
  result: PendingUberOrdersResult,
): UberOrdersListResponse => {
  const items = result.items.map((order) => ({
    externalOrderId: order.externalOrderId ?? '',
    status: order.status,
    storeId: null,
    createdAt: dateOf(order.createdAt),
    updatedAt: null,
  }));
  return toUberListResponse(items, 100);
};
export const presentOrderSummary = (
  result: PendingUberOrdersSummary,
): UberOrderSummaryResponse => {
  return {
    total: result.count,
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentOrderMutation = (): UberOrderMutationResponse =>
  toUberMutationResponse();
