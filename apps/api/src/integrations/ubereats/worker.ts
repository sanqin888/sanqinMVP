import type { Provider } from '@nestjs/common';
import { createUberEatsWorkerRuntimeModule } from './ubereats.module';
import {
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './infrastructure/workers/uber-worker.adapters';
import { UberWorkerHealthService } from './infrastructure/workers/uber-worker-health.service';
import { UberWorkerWakeService } from './infrastructure/workers/uber-worker-wake.service';

/** Worker runtime declarations consumed only through this dedicated entry. */
export const UBER_EATS_WORKER_PROVIDERS: Provider[] = [
  UberWebhookInboxWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWorkerHealthService,
  UberWorkerWakeService,
];

/**
 * Dedicated process runtime assembled by the sole Uber Eats composition root.
 * Process hosts must consume this entry instead of importing internal modules.
 */
export const UBER_EATS_WORKER_RUNTIME_MODULE =
  createUberEatsWorkerRuntimeModule(UBER_EATS_WORKER_PROVIDERS);

/** Stable process-host contracts for worker health and wake signaling. */
export { UberWorkerHealthService, UberWorkerWakeService };
