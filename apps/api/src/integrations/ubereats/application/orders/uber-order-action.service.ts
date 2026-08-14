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

export class UberOrderActionService {
  constructor(
    private readonly repository: UberOrderActionRepositoryPort,
    private readonly gateway: UberOrderActionGatewayPort,
  ) {}

  request(
    externalOrderId: string,
    action: UberOrderActionName,
    denial?: UberOrderDenial,
  ) {
    return this.repository.enqueue(
      this.buildIntent({ externalOrderId, action, denial }),
    );
  }

  buildIntent<TAction extends UberOrderActionName>(input: {
    externalOrderId: string;
    action: TAction;
    denial?: UberOrderDenial;
  }): UberOrderActionIntent<TAction> {
    const { action, denial } = input;
    const id = input.externalOrderId.trim();
    if (!id) throw new Error('externalOrderId 不能为空');
    if (action === 'DENY' && !denial?.reasonCode.trim())
      throw new Error('拒单原因不能为空');
    return {
      externalOrderId: id,
      action,
      idempotencyKey: UberOrderStateMachine.idempotencyKey(id, action),
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
    const currentStatus = await this.repository.getOrderStatus(
      task.externalOrderId,
    );
    try {
      const common = {
        externalOrderId: task.externalOrderId,
        idempotencyKey: task.idempotencyKey,
      };
      if (task.action === 'ACCEPT') await this.gateway.accept(common);
      else if (task.action === 'DENY')
        await this.gateway.deny({
          ...common,
          denial: {
            reasonCode: task.reasonCode ?? 'OTHER',
            reasonDetail: task.reasonDetail,
          },
        });
      else if (task.action === 'CANCEL')
        await this.gateway.cancel({
          ...common,
          denial: {
            reasonCode: task.reasonCode ?? 'OTHER',
            reasonDetail: task.reasonDetail,
          },
        });
      else await this.gateway.readyForPickup(common);
    } catch (error) {
      const upstream = this.classifyFailure(error);
      await this.repository.markFailed(task.taskId, task.leaseToken, {
        retryable: upstream.retryable,
        code:
          upstream.failure?.code ??
          (upstream.status ? `HTTP_${upstream.status}` : 'UPSTREAM_ERROR'),
        message: error instanceof Error ? error.message : String(error),
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
