import type { UberOrderActionName } from '../../domain/orders/uber-order.types';

export const UBER_ORDER_ACTION_GATEWAY = Symbol('UBER_ORDER_ACTION_GATEWAY');

export type UberGatewayOutcome<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

/** Narrow application-owned boundary; HTTP, URL, token and Response stay outside. */
export interface UberOrderActionGatewayPort {
  executeAction(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<UberGatewayOutcome>;
}
