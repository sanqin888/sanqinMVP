import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import {
  type UberOrderActionIntent,
  type UberOrderActionGatewayPort,
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

  async process(limit: number, owner: string): Promise<number> {
    const tasks = await this.repository.claim({
      limit,
      owner,
      now: new Date(),
      leaseDurationMs: 30_000,
    });
    await Promise.all(tasks.map((task) => this.execute(task)));
    return tasks.length;
  }

  private async execute(task: UberOrderActionTask): Promise<void> {
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
      else if (task.action === 'CANCEL') await this.gateway.cancel(common);
      else await this.gateway.readyForPickup(common);
      // The exact lease returned by claim is mandatory. A false result means
      // another worker owns the row; its local transition must remain untouched.
      await this.repository.markSucceeded(task.taskId, task.leaseToken);
    } catch (error) {
      const upstream = this.classifyFailure(error);
      await this.repository.markFailed(task.taskId, task.leaseToken, {
        retryable: upstream.retryable,
        code: upstream.status ? `HTTP_${upstream.status}` : 'UPSTREAM_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private classifyFailure(error: unknown): {
    status: number | null;
    retryable: boolean;
  } {
    if (!error || typeof error !== 'object')
      return { status: null, retryable: true };
    const status = (error as { status?: unknown }).status;
    if (typeof status !== 'number') return { status: null, retryable: true };
    return {
      status,
      retryable: status === 408 || status === 429 || status >= 500,
    };
  }
}
