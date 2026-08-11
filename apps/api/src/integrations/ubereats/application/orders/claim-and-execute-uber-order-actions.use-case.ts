import { ExecuteUberOrderActionWorker } from './uber-order.use-cases';

/** Application coordinator for one durable order-action batch. */
export class ClaimAndExecuteUberOrderActionsUseCase {
  constructor(private readonly actions: ExecuteUberOrderActionWorker) {}

  execute(limit = 50): Promise<unknown> {
    return this.actions.execute(limit);
  }
}
