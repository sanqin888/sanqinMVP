import type { Provider } from '@nestjs/common';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './infrastructure/workers/uber-worker.adapters';
import { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';

/** Worker runtime declarations consumed by the process root outside this context. */
export const UBER_EATS_WORKER_PROVIDERS: Provider[] = [
  UberWebhookInboxWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberMenuPublishConfirmationWorkerAdapter,
  UberWorkerHealthService,
];

/** Stable health-check contract for worker process hosts. */
export { UberWorkerHealthService };
