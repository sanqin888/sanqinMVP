import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberOrderSummaryResponse,
  UberOrdersListResponse,
} from '../contracts/responses/orders.responses';
import { dateOf, numberOf, recordOf, textOf } from './presenter.utils';

export const presentPendingOrders = (
  result: unknown,
): UberOrdersListResponse => {
  const source = recordOf(result);
  const items = Array.isArray(source.items)
    ? source.items.map((value) => {
        const order = recordOf(value);
        return {
          externalOrderId: textOf(order.externalOrderId) ?? '',
          status: textOf(order.status) ?? '',
          storeId: textOf(order.storeId) ?? textOf(order.uberStoreId),
          createdAt: dateOf(order.createdAt),
          updatedAt: dateOf(order.updatedAt),
        };
      })
    : [];
  return toUberListResponse(items, 100);
};
export const presentOrderSummary = (
  result: unknown,
): UberOrderSummaryResponse => {
  const source = recordOf(result);
  return {
    total: numberOf(source.total ?? source.count),
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentOrderMutation = () => toUberMutationResponse();
