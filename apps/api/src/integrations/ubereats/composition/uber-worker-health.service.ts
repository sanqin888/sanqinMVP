import { Injectable } from '@nestjs/common';

import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
  type UberWorkerMetrics,
} from '../infrastructure/workers/uber-worker.adapters';

export interface UberWorkerHealth {
  readonly status: 'ok' | 'starting';
  readonly adapters: Readonly<{
    webhookInbox: Readonly<UberWorkerMetrics>;
    orderAction: Readonly<UberWorkerMetrics>;
    menuConfirmation: Readonly<UberWorkerMetrics>;
  }>;
}

/** Dependency-free health snapshot consumed by the worker's private health server. */
@Injectable()
export class UberWorkerHealthService {
  constructor(
    private readonly webhookInbox: UberWebhookInboxWorkerAdapter,
    private readonly orderAction: UberOrderActionWorkerAdapter,
    private readonly menuConfirmation: UberMenuPublishConfirmationWorkerAdapter,
  ) {}

  snapshot(): UberWorkerHealth {
    const adapters = {
      webhookInbox: this.webhookInbox.getMetrics(),
      orderAction: this.orderAction.getMetrics(),
      menuConfirmation: this.menuConfirmation.getMetrics(),
    };
    return {
      status: Object.values(adapters).every(
        (metrics) => metrics.lastSuccessfulAt !== null,
      )
        ? 'ok'
        : 'starting',
      adapters,
    };
  }
}
