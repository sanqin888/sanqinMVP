import { resolveUberReadyForPickupAt } from '../../domain/orders/uber-order-preparation.policy';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import {
  type UberOrderActionIntent,
  type UberOrderActionGatewayPort,
  type UberOrderCommandFailure,
  type UberOrderActionRepositoryPort,
  type UberOrderActionTask,
  type UberOrderDenial,
} from './uber-order.ports';
import type { UberWorkerWakePort } from '../shared/uber-worker-wake.port';

const SCHEDULED_FINALIZE_PHASE = 'scheduled-finalize';

export class UberOrderActionService {
  constructor(
    private readonly repository: UberOrderActionRepositoryPort,
    private readonly gateway: UberOrderActionGatewayPort,
    private readonly workerWake: UberWorkerWakePort,
  ) {}

  async request(
    externalOrderId: string,
    action: UberOrderActionName,
    denial?: UberOrderDenial,
  ) {
    const queued = await this.repository.enqueue(
      this.buildIntent({ externalOrderId, action, denial }),
    );
    this.notifyPersistedAction(queued);
    return queued;
  }

  async requestScheduledFinalizeAccept(externalOrderId: string) {
    const queued = await this.repository.requeue(
      this.buildIntent({
        externalOrderId,
        action: 'ACCEPT',
        phase: SCHEDULED_FINALIZE_PHASE,
      }),
    );
    this.notifyPersistedAction(queued);
    return queued;
  }

  notifyPersistedAction(
    action: { taskId: string; created: boolean } | null,
  ): void {
    if (action) this.workerWake.signal('orderAction');
  }

  buildIntent<TAction extends UberOrderActionName>(input: {
    externalOrderId: string;
    action: TAction;
    denial?: UberOrderDenial;
    phase?: string;
  }): UberOrderActionIntent<TAction> {
    const { action, denial } = input;
    const id = input.externalOrderId.trim();
    if (!id) throw new Error('externalOrderId 不能为空');
    if (action === 'DENY' && !denial?.reasonCode.trim())
      throw new Error('拒单原因不能为空');
    return {
      externalOrderId: id,
      action,
      idempotencyKey: UberOrderStateMachine.idempotencyKey(
        id,
        action,
        input.phase,
      ),
      businessVersion: 'v1',
      reasonCode: denial?.reasonCode.trim() ?? null,
      reasonDetail: denial?.reasonDetail?.trim() || null,
    };
  }

  /** Executes one task whose lease has already been acquired by a worker. */
  async executeClaimed(task: UberOrderActionTask): Promise<void> {
    // Local reads and writeback deliberately sit outside the upstream failure
    // handler. A database failure must leave the claim to expire, rather than
    // being mislabeled as a failed Uber command.
    const orderContext = await this.repository.getOrderContext(
      task.externalOrderId,
    );
    const currentStatus = orderContext?.status ?? null;
    let upstreamStatus: number;
    try {
      const common = {
        externalOrderId: task.externalOrderId,
        idempotencyKey: task.idempotencyKey,
      };
      if (task.action === 'ACCEPT')
        upstreamStatus = (
          await this.gateway.accept({
            ...common,
            // A scheduled order may only have Uber's target delivery window when
            // first created. That window is sufficient for SanQ's local queue but
            // is not a kitchen-ready estimate, so only echo an actual Uber
            // preparation estimate back as ready_for_pickup_time.
            readyForPickupAt:
              orderContext?.fulfillmentTiming === 'SCHEDULED'
                ? (orderContext.externalEstimatedReadyAt ?? undefined)
                : resolveUberReadyForPickupAt(
                    orderContext?.totalCents ?? 0,
                    orderContext?.referenceAt ?? new Date(),
                  ),
          })
        ).upstreamStatus;
      else if (task.action === 'DENY')
        upstreamStatus = (
          await this.gateway.deny({
            ...common,
            denial: {
              reasonCode: task.reasonCode ?? 'OTHER',
              reasonDetail: task.reasonDetail,
            },
          })
        ).upstreamStatus;
      else if (task.action === 'CANCEL')
        upstreamStatus = (
          await this.gateway.cancel({
            ...common,
            denial: {
              reasonCode: task.reasonCode ?? 'OTHER',
              reasonDetail: task.reasonDetail,
            },
          })
        ).upstreamStatus;
      else
        upstreamStatus = (await this.gateway.readyForPickup(common))
          .upstreamStatus;
    } catch (error) {
      const upstream = this.classifyFailure(error);
      await this.repository.markFailed(task.taskId, task.leaseToken, {
        retryable: upstream.retryable,
        code:
          upstream.failure?.code ??
          (upstream.status ? `HTTP_${upstream.status}` : 'UPSTREAM_ERROR'),
        message: error instanceof Error ? error.message : String(error),
        upstreamStatus: upstream.status,
        responseBody: upstream.failure?.responseBody ?? null,
      });
      return;
    }

    // The exact lease returned by claim is mandatory. A false result means
    // another worker owns the row; its local transition must remain untouched.
    const nextStatus =
      currentStatus === null
        ? null
        : UberOrderStateMachine.afterConfirmedAction(
            currentStatus,
            task.action,
          );
    await this.repository.complete({
      taskId: task.taskId,
      leaseToken: task.leaseToken,
      // Preserve the exact upstream success code confirmed by the infrastructure
      // adapter, including the narrowly supported Sandbox CANCEL 200 compatibility.
      upstreamStatus,
      transition:
        currentStatus !== null && nextStatus !== null
          ? { from: currentStatus, to: nextStatus }
          : null,
    });
  }

  private classifyFailure(error: unknown): {
    status: number | null;
    retryable: boolean;
    failure: UberOrderCommandFailure | null;
  } {
    if (!this.isCommandFailure(error))
      return { status: null, retryable: true, failure: null };
    const status = error.status;
    if (status === null)
      return { status: null, retryable: true, failure: error };
    return {
      status,
      retryable: status === 408 || status === 429 || status >= 500,
      failure: error,
    };
  }

  private isCommandFailure(error: unknown): error is UberOrderCommandFailure {
    if (!(error instanceof Error) || !('status' in error)) return false;
    const status = (error as { status: unknown }).status;
    return status === null || typeof status === 'number';
  }
}
