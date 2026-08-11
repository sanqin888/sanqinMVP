import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { ClaimAndExecuteUberOrderActionsUseCase } from '../../application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from '../../application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ConfirmUberMenuPublicationsUseCase } from '../../application/menu/confirm-uber-menu-publications.use-case';
import {
  UberConfigService,
  type UberWorkerKind,
} from '../config/uber-config.service';

export interface UberWorkerMetrics {
  readonly lastSuccessfulAt: Date | null;
  readonly claimed: number;
  readonly failures: number;
  readonly backlog: number;
  readonly leaseRecoveries: number;
}

type DispatchResult =
  | number
  | unknown[]
  | {
      claimed: number;
      backlog?: number;
      leaseRecoveries?: number;
    }
  | void;
type PollAggregate = {
  claimed: number;
  backlog: number;
  leaseRecoveries: number;
};

abstract class UberPollingWorkerAdapter
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<boolean>;
  private stopping = false;
  private consecutiveFailures = 0;
  private metrics: UberWorkerMetrics = {
    lastSuccessfulAt: null,
    claimed: 0,
    failures: 0,
    backlog: 0,
    leaseRecoveries: 0,
  };
  protected abstract readonly logger: Logger;

  protected constructor(
    protected readonly config: UberConfigService,
    private readonly kind: UberWorkerKind,
  ) {}

  onModuleInit(): void {
    if (!this.config.workerEnabled) return;
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (!this.inFlight) return;
    await Promise.race([
      this.inFlight.then(() => undefined),
      new Promise<void>((resolve) => {
        const timeout = setTimeout(
          resolve,
          this.config.workerShutdownTimeoutMs,
        );
        timeout.unref?.();
      }),
    ]);
  }

  getMetrics(): Readonly<UberWorkerMetrics> {
    return { ...this.metrics };
  }

  /** Local guard plus repository leases prevent overlapping claims across instances. */
  runOnce(): Promise<boolean> {
    if (this.stopping || this.inFlight) return Promise.resolve(false);
    const execution = this.executePoll();
    this.inFlight = execution;
    void execution.finally(() => {
      if (this.inFlight === execution) this.inFlight = undefined;
    });
    return execution;
  }

  private async executePoll(): Promise<boolean> {
    try {
      const policy = this.config.workerPolicies[this.kind];
      const laneSize = Math.ceil(
        this.config.workerBatchSize / policy.concurrency,
      );
      const results = await Promise.all(
        Array.from({ length: policy.concurrency }, (_, lane) => {
          const remaining = this.config.workerBatchSize - lane * laneSize;
          return remaining > 0
            ? this.dispatch(Math.min(laneSize, remaining))
            : Promise.resolve(0);
        }),
      );
      const poll = results.reduce<PollAggregate>(
        (total, result) => {
          let normalized = { claimed: 0, backlog: 0, leaseRecoveries: 0 };
          if (typeof result === 'number') {
            normalized = { ...normalized, claimed: result };
          } else if (Array.isArray(result)) {
            normalized = { ...normalized, claimed: result.length };
          } else if (result && typeof result === 'object') {
            normalized = {
              claimed: result.claimed,
              backlog: result.backlog ?? 0,
              leaseRecoveries: result.leaseRecoveries ?? 0,
            };
          }
          return {
            claimed: total.claimed + normalized.claimed,
            backlog: total.backlog + normalized.backlog,
            leaseRecoveries: total.leaseRecoveries + normalized.leaseRecoveries,
          };
        },
        { claimed: 0, backlog: 0, leaseRecoveries: 0 },
      );
      this.metrics = {
        lastSuccessfulAt: new Date(),
        claimed: this.metrics.claimed + poll.claimed,
        failures: this.metrics.failures,
        backlog: poll.backlog,
        leaseRecoveries: this.metrics.leaseRecoveries + poll.leaseRecoveries,
      };
      this.consecutiveFailures = 0;
      return true;
    } catch (error) {
      this.consecutiveFailures += 1;
      this.metrics = { ...this.metrics, failures: this.metrics.failures + 1 };
      this.logger.error(
        `Uber worker poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      void this.runOnce().then((succeeded) => {
        if (this.stopping) return;
        const policy = this.config.workerPolicies[this.kind];
        const retryDelay = Math.min(
          policy.maxBackoffMs,
          policy.initialBackoffMs *
            2 ** Math.max(0, this.consecutiveFailures - 1),
        );
        this.schedule(
          succeeded ? this.config.workerPollIntervalMs : retryDelay,
        );
      });
    }, delayMs);
    this.timer.unref?.();
  }

  protected abstract dispatch(limit: number): Promise<DispatchResult>;
}

@Injectable()
export class UberWebhookInboxWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(UberWebhookInboxWorkerAdapter.name);
  constructor(
    private readonly useCase: ClaimAndProcessUberWebhookInboxUseCase,
    config: UberConfigService,
  ) {
    super(config, 'webhookInbox');
  }
  protected dispatch(limit: number) {
    return this.useCase.execute(limit);
  }
}

@Injectable()
export class UberOrderActionWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(UberOrderActionWorkerAdapter.name);
  constructor(
    private readonly useCase: ClaimAndExecuteUberOrderActionsUseCase,
    config: UberConfigService,
  ) {
    super(config, 'orderAction');
  }
  protected dispatch(limit: number) {
    return this.useCase.execute(limit) as Promise<DispatchResult>;
  }
}

@Injectable()
export class UberMenuPublishConfirmationWorkerAdapter extends UberPollingWorkerAdapter {
  protected readonly logger = new Logger(
    UberMenuPublishConfirmationWorkerAdapter.name,
  );
  constructor(
    private readonly useCase: ConfirmUberMenuPublicationsUseCase,
    config: UberConfigService,
  ) {
    super(config, 'menuConfirmation');
  }
  protected dispatch(limit: number) {
    return this.useCase.execute(limit);
  }
}
