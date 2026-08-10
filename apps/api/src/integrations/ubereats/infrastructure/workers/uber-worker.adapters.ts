import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import {
  ClaimAndExecuteUberOrderActionsUseCase,
  ClaimAndProcessUberWebhookInboxUseCase,
  ConfirmUberMenuPublicationsUseCase,
} from '../../application/workers/uber-background-task.use-cases';

abstract class UberPollingWorkerAdapter
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private running = false;
  protected abstract readonly logger: Logger;

  protected constructor(private readonly intervalMs = 15_000) {}

  onModuleInit(): void {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Prevents one process from overlapping polls; repository leases coordinate processes. */
  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      await this.dispatch();
      return true;
    } catch (error) {
      this.logger.error(
        `Uber worker poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    } finally {
      this.running = false;
    }
  }

  protected abstract dispatch(): Promise<unknown>;
}

@Injectable()
export class UberWebhookInboxWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(UberWebhookInboxWorkerAdapter.name);
  constructor(
    private readonly useCase: ClaimAndProcessUberWebhookInboxUseCase,
  ) {
    super();
  }
  protected dispatch() {
    return this.useCase.execute();
  }
}

@Injectable()
export class UberOrderActionWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(UberOrderActionWorkerAdapter.name);
  constructor(
    private readonly useCase: ClaimAndExecuteUberOrderActionsUseCase,
  ) {
    super();
  }
  protected dispatch() {
    return this.useCase.execute();
  }
}

@Injectable()
export class UberMenuPublishConfirmationWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(
    UberMenuPublishConfirmationWorkerAdapter.name,
  );
  constructor(private readonly useCase: ConfirmUberMenuPublicationsUseCase) {
    super();
  }
  protected dispatch() {
    return this.useCase.execute();
  }
}
