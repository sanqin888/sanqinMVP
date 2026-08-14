import { UBER_ACTION_BY_LOCAL_STATUS } from '../../domain/orders/uber-order.types';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberJsonValue } from '../shared/uber-json-value';
import { type UberOrderStatusAuditPort } from './uber-order-processing.ports';

/** Centralizes local-to-Uber status mapping and sync audit records. */
export class UberOrderStatusSyncService {
  constructor(private readonly auditPort: UberOrderStatusAuditPort) {}
  actionFor(status: UberOrderStatus) {
    return UBER_ACTION_BY_LOCAL_STATUS[status];
  }
  clientRequestId(externalOrderId: string) {
    return `ubereats:${externalOrderId}`;
  }
  async audit(eventName: string, payload: UberJsonValue) {
    await this.auditPort.record(eventName, payload);
  }
}
