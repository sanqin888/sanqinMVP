import type { ParsedUberOrder } from '../../domain/orders/uber-order.types';

/** Token for the Uber order-detail query boundary. */
export const UBER_ORDER_DETAIL_QUERY = Symbol('UBER_ORDER_DETAIL_QUERY');

/** Reads an Uber order resource without exposing HTTP response protocols. */
export interface UberOrderDetailQueryPort {
  fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
  }): Promise<UberOrderDetailResult>;
}

/** Validated order-detail outcome; wire JSON never crosses this boundary. */
export type UberOrderDetailResult =
  | { kind: 'parsed'; order: ParsedUberOrder }
  | {
      kind: 'invalid';
      reason:
        | 'MALFORMED_PAYLOAD'
        | 'MISSING_ORDER_ID'
        | 'MISSING_TOTAL'
        | 'EMPTY_ITEMS'
        | 'MISSING_SCHEDULED_READY_AT';
    };
