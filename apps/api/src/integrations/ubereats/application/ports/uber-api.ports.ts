import type { UberOrderActionName } from '../../domain/orders/uber-order.types';

export const UBER_ORDER_ACTION_GATEWAY = Symbol('UBER_ORDER_ACTION_GATEWAY');
export const UBER_MERCHANT_GATEWAY = Symbol('UBER_MERCHANT_GATEWAY');

export interface UberMerchantGatewayPort {
  buildMerchantAuthorizeUrl(...args: any[]): any;
  startMerchantOAuth(...args: any[]): Promise<any>;
  exchangeAuthorizationCode(...args: any[]): Promise<any>;
  getMerchantConnectionStatus(...args: any[]): any;
  getMerchantStores(...args: any[]): any;
  updatePosExternalStoreId(...args: any[]): any;
  provisionStore(...args: any[]): any;
  revokeOrDeprovisionStore(...args: any[]): any;
  syncStoreStatusToUber(...args: any[]): any;
}

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
