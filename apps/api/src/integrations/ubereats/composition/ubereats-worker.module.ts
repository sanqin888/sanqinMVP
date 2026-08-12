import { Module, type Provider } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ClaimAndExecuteUberOrderActionsUseCase } from '../application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from '../application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ExecuteUberOrderActionWorker } from '../application/orders/uber-order.use-cases';
import { ProcessUberWebhookInboxUseCase } from '../application/orders/process-uber-webhook-inbox.use-case';
import { ConfirmUberMenuPublicationUseCase } from '../application/menu/confirm-uber-menu-publication.use-case';
import { ConfirmUberMenuPublicationsUseCase } from '../application/menu/confirm-uber-menu-publications.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../application/menu/recover-timed-out-menu-publications.use-case';
import { UBER_EATS_ORDER_PROVIDERS } from '../modules/orders.module';
import { UBER_EATS_MENU_PROVIDERS } from '../modules/menu.module';
import { UBER_EATS_MERCHANT_PROVIDERS } from '../modules/merchant.module';
import { UberEatsInternalInfrastructureModule } from '../modules/ubereats-internal-infrastructure.module';
import { ImportUberOrderUseCase } from '../application/orders/uber-order.use-cases';
import { UberOrderActionService } from '../application/orders/uber-order-action.service';
import { UberOrderActionPrismaAdapter } from '../infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from '../infrastructure/persistence/uber-order-import-prisma.adapter';
import { UberOrderActionGatewayAdapter } from '../infrastructure/uber-api/uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from '../infrastructure/uber-api/uber-order-detail.gateway';
import { UberMenuNotificationHandler } from '../application/menu/uber-menu-notification.handler';
import { UberMenuNotificationPrismaRepository } from '../infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuPublicationPrismaAdapter } from '../infrastructure/persistence/uber-menu-publication-prisma.adapter';
import { UberMenuGatewayAdapter } from '../infrastructure/uber-api/uber-menu-publication.adapter';
import { HandleUberMerchantWebhookHandler } from '../application/merchant/uber-merchant-webhook.handler';

const providerToken = (provider: Provider) =>
  typeof provider === 'function'
    ? provider
    : 'provide' in provider
      ? provider.provide
      : provider;
const selectProviders = (
  providers: readonly Provider[],
  tokens: readonly unknown[],
) =>
  providers.filter(
    (provider) =>
      tokens.includes(providerToken(provider)) ||
      (typeof provider !== 'function' &&
        'useExisting' in provider &&
        tokens.includes(provider.useExisting)),
  );

const WORKER_APPLICATION_PROVIDERS = [
  ...selectProviders(UBER_EATS_ORDER_PROVIDERS, [
    UberOrderActionPrismaAdapter,
    UberOrderImportPrismaAdapter,
    UberOrderActionGatewayAdapter,
    UberOrderDetailGatewayAdapter,
    UberOrderActionService,
    ImportUberOrderUseCase,
    ExecuteUberOrderActionWorker,
    ProcessUberWebhookInboxUseCase,
  ]),
  ...selectProviders(UBER_EATS_MENU_PROVIDERS as Provider[], [
    UberMenuNotificationPrismaRepository,
    UberMenuNotificationHandler,
    UberMenuPublicationPrismaAdapter,
    UberMenuGatewayAdapter,
    ConfirmUberMenuPublicationUseCase,
    RecoverTimedOutMenuPublicationsUseCase,
  ]),
  ...selectProviders(UBER_EATS_MERCHANT_PROVIDERS as Provider[], [
    HandleUberMerchantWebhookHandler,
  ]),
];
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from '../infrastructure/workers/uber-worker.adapters';
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
  imports: [PrismaModule, UberEatsInternalInfrastructureModule],
  providers: [...WORKER_APPLICATION_PROVIDERS, ...WORKER_PROVIDERS],
  exports: [UberWorkerHealthService],
})
export class UberEatsInfrastructureWorkerModule {}
