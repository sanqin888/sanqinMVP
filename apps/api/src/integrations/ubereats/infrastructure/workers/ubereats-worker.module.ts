import { Module } from '@nestjs/common';
import { UberEatsCompositionModule } from '../../ubereats.module';
import { UberWorkerHealthService } from './uber-worker-health.service';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';

/**
 * Worker-only lifecycle selection. All adapter, port and use-case wiring comes
 * from the bounded context's single composition root.
 */
@Module({
  imports: [UberEatsCompositionModule],
  providers: [
    UberWebhookInboxWorkerAdapter,
    UberOrderActionWorkerAdapter,
    UberMenuPublishConfirmationWorkerAdapter,
    UberWorkerHealthService,
  ],
  exports: [UberWorkerHealthService],
})
export class UberEatsWorkerLifecycleModule {}
