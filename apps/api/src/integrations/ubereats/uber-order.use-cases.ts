import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import type { ParsedUberOrder, UberOrderActionName } from './uber-order.types';
import { UberOrderPayloadParser } from './uber-order-payload.parser';
import { UberOrderStateMachine } from './uber-order.state-machine';

/** Fetches and normalizes input only; it deliberately performs no writes. */
@Injectable()
export class ImportUberOrderUseCase {
  constructor(private readonly parser = new UberOrderPayloadParser()) {}
  async execute(fetchDetail: () => Promise<unknown>): Promise<ParsedUberOrder> {
    const parsed = this.parser.parse(await fetchDetail());
    if (!parsed) throw new BadRequestException('Uber 订单详情无法解析');
    return parsed;
  }
}

/** Defines the single transaction boundary for order graph, inbox and initial action. */
@Injectable()
export class PersistUberOrderUseCase {
  async execute<T>(
    transaction: <R>(
      work: (tx: Prisma.TransactionClient) => Promise<R>,
    ) => Promise<R>,
    persist: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return transaction(persist);
  }
}

/** Records a channel cancellation and conditionally applies its legal transition. */
@Injectable()
export class HandleUberOrderCancellationUseCase {
  targetStatus(current: OrderStatus) {
    return UberOrderStateMachine.afterCancellation(current);
  }
}

/** Validates a POS command and atomically inserts its durable outbox intent. */
@Injectable()
export class RequestUberOrderActionUseCase {
  assertAllowed(status: OrderStatus, action: UberOrderActionName): void {
    if (!UberOrderStateMachine.canRequestAction(status, action))
      throw new BadRequestException(`订单状态 ${status} 不允许动作 ${action}`);
  }
}

/** Worker boundary: lease first, call Uber second, then persist a known/unknown result. */
@Injectable()
export class ExecuteUberOrderActionWorker {
  execute<T>(drain: () => Promise<T>): Promise<T> {
    return drain();
  }
}
