import type { UberOrderActionName } from '../../domain/orders/uber-order.types';

export const UBER_ORDER_ACTION_GATEWAY = Symbol('UBER_ORDER_ACTION_GATEWAY');
export const UBER_ORDER_DETAIL_GATEWAY = Symbol('UBER_ORDER_DETAIL_GATEWAY');

/** Reads the Uber order resource and exposes only its domain payload. */
export interface UberOrderDetailGatewayPort {
  fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
  }): Promise<unknown>;
}

export type UberGatewayOutcome<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};
export interface UberOrderActionGatewayPort {
  executeAction(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<UberGatewayOutcome>;
}
