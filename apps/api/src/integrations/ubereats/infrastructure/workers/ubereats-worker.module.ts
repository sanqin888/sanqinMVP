import { Module } from '@nestjs/common';
import { ClaimAndExecuteUberOrderActionsUseCase } from '../../application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from '../../application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ExecuteUberOrderActionWorker } from '../../application/orders/uber-order.use-cases';
import { ProcessUberWebhookInboxUseCase } from '../../application/orders/process-uber-webhook-inbox.use-case';
import { ConfirmUberMenuPublicationUseCase } from '../../application/menu/confirm-uber-menu-publication.use-case';
import { ConfirmUberMenuPublicationsUseCase } from '../../application/menu/confirm-uber-menu-publications.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../../application/menu/recover-timed-out-menu-publications.use-case';
import { UberEatsApplicationModule } from '../../ubereats-application.module';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';
import { UberWorkerHealthService } from './uber-worker-health.service';

const WORKER_PROVIDERS = [
  {
    provide: ClaimAndProcessUberWebhookInboxUseCase,
    inject: [ProcessUberWebhookInboxUseCase],
    useFactory: (inbox: ProcessUberWebhookInboxUseCase) =>
      new ClaimAndProcessUberWebhookInboxUseCase(inbox),
  },
  {
    provide: ClaimAndExecuteUberOrderActionsUseCase,
    inject: [ExecuteUberOrderActionWorker],
    useFactory: (actions: ExecuteUberOrderActionWorker) =>
      new ClaimAndExecuteUberOrderActionsUseCase(actions),
  },
  {
    provide: ConfirmUberMenuPublicationsUseCase,
    inject: [
      ConfirmUberMenuPublicationUseCase,
      RecoverTimedOutMenuPublicationsUseCase,
    ],
    useFactory: (
      confirmations: ConfirmUberMenuPublicationUseCase,
      recovery: RecoverTimedOutMenuPublicationsUseCase,
    ) => new ConfirmUberMenuPublicationsUseCase(confirmations, recovery),
  },
  UberWebhookInboxWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberMenuPublishConfirmationWorkerAdapter,
  UberWorkerHealthService,
];

/** Controller-free composition root for the dedicated polling process. */
@Module({
  imports: [UberEatsApplicationModule],
  providers: WORKER_PROVIDERS,
  exports: [UberWorkerHealthService],
})
export class UberEatsInfrastructureWorkerModule {}
