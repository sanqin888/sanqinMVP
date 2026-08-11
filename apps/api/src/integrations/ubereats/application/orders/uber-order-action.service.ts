import { Inject, Injectable } from '@nestjs/common';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import {
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  type UberOrderActionGatewayPort,
  type UberOrderActionRepositoryPort,
  type UberOrderActionTask,
} from '../ports/uber-order.ports';

@Injectable()
export class UberOrderActionService {
  constructor(
    @Inject(UBER_ORDER_ACTION_REPOSITORY)
    private readonly repository: UberOrderActionRepositoryPort,
    @Inject(UBER_ORDER_ACTION_COMMAND_GATEWAY)
    private readonly gateway: UberOrderActionGatewayPort,
  ) {}

  request(
    externalOrderId: string,
    action: UberOrderActionName,
    denial?: { reasonCode: string; reasonDetail: string | null },
  ) {
    const id = externalOrderId.trim();
    if (!id) throw new Error('externalOrderId 不能为空');
    if (action === 'DENY' && !denial?.reasonCode.trim())
      throw new Error('拒单原因不能为空');
    return this.repository.enqueue({
      externalOrderId: id,
      action,
      idempotencyKey: UberOrderStateMachine.idempotencyKey(id, action),
      businessVersion: 'v1',
      reasonCode: denial?.reasonCode.trim() ?? null,
      reasonDetail: denial?.reasonDetail?.trim() || null,
    });
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
      else await this.gateway.readyForPickup(common);
      // The exact lease returned by claim is mandatory. A false result means
      // another worker owns the row; its local transition must remain untouched.
      await this.repository.markSucceeded(task.taskId, task.leaseToken);
    } catch (error) {
      const upstream = this.asUpstreamError(error);
      await this.repository.markFailed(task.taskId, task.leaseToken, {
        retryable: upstream?.retryable ?? true,
        code: upstream ? `HTTP_${upstream.status}` : 'UPSTREAM_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private asUpstreamError(error: unknown): {
    status: number;
    retryable: boolean;
  } | null {
    if (!error || typeof error !== 'object') return null;
    const value = error as { status?: unknown; retryable?: unknown };
    return typeof value.status === 'number' &&
      typeof value.retryable === 'boolean'
      ? { status: value.status, retryable: value.retryable }
      : null;
  }
}
