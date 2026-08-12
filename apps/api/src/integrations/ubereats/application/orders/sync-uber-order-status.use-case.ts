import { UberValidationError } from '../errors/uber-application.error';
import { buildUberIdempotencyKey } from '../idempotency/uber-idempotency-key';
import type { UberTelemetryPort } from '../ports/uber-order-processing.ports';
import type {
  UberOrderActionQueuePort,
  UberOrderSyncRepositoryPort,
  UberOrderSyncUnitOfWorkPort,
} from '../ports/uber-order-sync.ports';
import type { UberOrderStatus } from '../../domain/orders/uber-order.types';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import { toUberEatsApplicationError } from '../uber-domain-error.mapper';
import { UberOrderStatusSyncService } from './uber-order-status-sync.service';

/** Records durable action intent and queues delivery without exposing storage concepts. */
export class SyncUberOrderStatusUseCase {
  constructor(
    private readonly orders: UberOrderSyncRepositoryPort,
    private readonly unitOfWork: UberOrderSyncUnitOfWorkPort,
    private readonly queue: UberOrderActionQueuePort,
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
    await this.unitOfWork.recordActionIntent({
      externalOrderId,
      action,
      idempotencyKey: buildUberIdempotencyKey({
        taskId: `${externalOrderId}:${action}`,
        resourceId: externalOrderId,
        action,
        businessVersion: 'v1',
      }),
    });
    const queued = await this.queue.enqueue(externalOrderId, action);
    const actionResult = {
      ok: queued.status === 'SUCCEEDED',
      action: queued.action,
      actionId: queued.id,
      status: queued.status,
      retryable: queued.retryable,
      duplicate: true,
      uberHttpStatus: queued.uberHttpStatus,
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
