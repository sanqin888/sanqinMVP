import { Injectable } from '@nestjs/common';

import type { UberWorkerWakeTarget } from '../../application/shared/uber-worker-wake.port';
import {
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';

@Injectable()
export class UberWorkerWakeService {
  constructor(
    private readonly webhookInbox: UberWebhookInboxWorkerAdapter,
    private readonly orderAction: UberOrderActionWorkerAdapter,
  ) {}

  wake(target: UberWorkerWakeTarget): boolean {
    return target === 'webhookInbox'
      ? this.webhookInbox.wake()
      : this.orderAction.wake();
  }
}
