import { Inject, Injectable } from '@nestjs/common';
import { UBER_ACTION_BY_LOCAL_STATUS } from '../../domain/orders/uber-order.types';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberJsonValue } from '../ports/uber-persistence.ports';
import {
  UBER_ORDER_STATUS_AUDIT_PORT,
  type UberOrderStatusAuditPort,
} from '../ports/uber-order-processing.ports';

/** Centralizes local-to-Uber status mapping and sync audit records. */
@Injectable()
export class UberOrderStatusSyncService {
  constructor(
    @Inject(UBER_ORDER_STATUS_AUDIT_PORT)
    private readonly auditPort: UberOrderStatusAuditPort,
  ) {}
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
