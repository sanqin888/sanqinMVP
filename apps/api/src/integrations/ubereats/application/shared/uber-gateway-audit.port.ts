export const UBER_GATEWAY_AUDIT_PORT = Symbol('UBER_GATEWAY_AUDIT_PORT');

export type UberGatewayAuditJsonValue =
  | null
  | boolean
  | number
  | string
  | UberGatewayAuditJsonValue[]
  | { [key: string]: UberGatewayAuditJsonValue };

export interface UberGatewayAuditEvent {
  operation: string;
  merchantUberUserId?: string;
  orderId?: string;
  storeId?: string;
  outcome: 'RECEIVED' | 'SUCCEEDED' | 'REJECTED' | 'FAILED';
  upstreamStatus: number | null;
  sanitizedRawResponse: UberGatewayAuditJsonValue;
  recordedAt: Date;
}

/** Dedicated sink for sanitized gateway responses. Writes are best-effort to callers. */
export interface UberGatewayAuditPort {
  recordResponse(event: UberGatewayAuditEvent): Promise<void>;
}
