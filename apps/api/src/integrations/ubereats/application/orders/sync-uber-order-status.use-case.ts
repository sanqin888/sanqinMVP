import { UberValidationError } from '../shared/uber-application.error';
import type { UberTelemetryPort } from '../shared/uber-telemetry.port';
import type { UberOrderSyncRepositoryPort } from './uber-order-sync.ports';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import { toUberEatsApplicationError } from '../shared/uber-domain-error.mapper';
import { UberOrderStatusSyncService } from './uber-order-status-sync.service';
import { UberOrderActionService } from './uber-order-action.service';

/** Records durable action intent and queues delivery without exposing storage concepts. */
export class SyncUberOrderStatusUseCase {
  constructor(
    private readonly orders: UberOrderSyncRepositoryPort,
    private readonly actions: UberOrderActionService,
    private readonly statusSync: UberOrderStatusSyncService,
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(externalOrderId: string, status: UberOrderStatus) {
    const order = await this.orders.findSyncTarget(externalOrderId);
    if (!order) {
      await this.telemetry.captureEvent('ubereats_order_sync_failed', {
        externalOrderId,
        status,
        reason: 'order_not_found',
      });
      return { ok: false, externalOrderId, status, reason: 'ORDER_NOT_FOUND' };
    }
    const action = this.statusSync.actionFor(status);
    if (!action)
      throw new UberValidationError({
        code: 'UBER_ORDER_STATUS_ACTION_UNSUPPORTED',
        message: `本地状态 ${status} 没有 Uber 文档支持的外部动作`,
        operation: 'order.status-sync',
      });
    try {
      UberOrderStateMachine.assertCanRequestAction(order.status, action);
    } catch (error) {
      throw toUberEatsApplicationError(error);
    }
    const queued = await this.actions.request(externalOrderId, action);
    const actionResult = {
      ok: false,
      action,
      actionId: queued.taskId,
      status: 'PENDING' as const,
      retryable: true,
      duplicate: !queued.created,
      uberHttpStatus: null,
    };
    await this.telemetry.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: order.orderStableId,
      status,
      action,
      actionResult: actionResult.ok ? 'SUCCEEDED' : 'FAILED',
    });
    return {
      ok: true,
      externalOrderId,
      orderStableId: order.orderStableId,
      status: order.status,
      action,
      localStatus: order.status,
      uberSyncStatus: actionResult.status,
      actionResult,
    };
  }
}
