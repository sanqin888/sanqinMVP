/** Token for the Uber order-detail query boundary. */
export const UBER_ORDER_DETAIL_QUERY = Symbol('UBER_ORDER_DETAIL_QUERY');

/** Reads an Uber order resource without exposing HTTP response protocols. */
export interface UberOrderDetailQueryPort {
  fetchOrderDetail(input: {
    resourceHref: string;
    eventType: string;
    eventId: string;
    resourceId: string | null;
  }): Promise<unknown>;
}
