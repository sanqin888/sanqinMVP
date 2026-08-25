import { Injectable, Logger } from '@nestjs/common';

import type {
  UberWorkerWakePort,
  UberWorkerWakeTarget,
} from '../../application/shared/uber-worker-wake.port';
import { UberWorkerConfigService } from './uber-worker-config.service';

const WAKE_PATH: Readonly<Record<UberWorkerWakeTarget, string>> = {
  webhookInbox: '/wake/webhook-inbox',
  orderAction: '/wake/order-action',
};

/** Best-effort process-to-process wake signal; durable rows remain the source of truth. */
@Injectable()
export class UberWorkerWakeHttpAdapter implements UberWorkerWakePort {
  private readonly logger = new Logger(UberWorkerWakeHttpAdapter.name);

  constructor(private readonly config: UberWorkerConfigService) {}

  signal(target: UberWorkerWakeTarget): void {
    const baseUrl = this.config.workerWakeBaseUrl;
    if (!baseUrl) return;

    void fetch(`${baseUrl}${WAKE_PATH[target]}`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.config.workerWakeTimeoutMs),
    })
      .then((response) => {
        if (!response.ok) {
          this.logger.warn(
            `Uber worker wake rejected target=${target} status=${response.status}`,
          );
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Uber worker wake unavailable target=${target}: ${message}`,
        );
      });
  }
}
