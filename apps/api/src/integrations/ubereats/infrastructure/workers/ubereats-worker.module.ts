import { Module } from '@nestjs/common';
import { AuthModule } from '../../../../auth/auth.module';
import { MessagingModule } from '../../../../messaging/messaging.module';
import { OrdersModule } from '../../../../orders/orders.module';
import { PrismaModule } from '../../../../prisma/prisma.module';
import { ConfirmUberMenuPublicationUseCase } from '../../application/menu/confirm-uber-menu-publication.use-case';
import { ConfirmUberMenuPublicationsUseCase } from '../../application/menu/confirm-uber-menu-publications.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../../application/menu/recover-timed-out-menu-publications.use-case';
import {
  type MenuNotificationRepository,
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from '../../application/menu/uber-menu-notification.handler';
import { HandleUberMerchantWebhookHandler } from '../../application/merchant/uber-merchant-webhook.handler';
import { ClaimAndExecuteUberOrderActionsUseCase } from '../../application/orders/claim-and-execute-uber-order-actions.use-case';
import { ClaimAndProcessUberWebhookInboxUseCase } from '../../application/orders/claim-and-process-uber-webhook-inbox.use-case';
import { ProcessUberWebhookInboxUseCase } from '../../application/orders/process-uber-webhook-inbox.use-case';
import { UberOrderActionService } from '../../application/orders/uber-order-action.service';
import {
  ExecuteUberOrderActionWorker,
  ImportUberOrderUseCase,
} from '../../application/orders/uber-order.use-cases';
import {
  type UberOrderDetailGatewayPort,
  UBER_ORDER_DETAIL_GATEWAY,
} from '../../application/ports/uber-api.ports';
import {
  type UberMenuGatewayPort,
  type UberMenuPublicationRepositoryPort,
  UBER_MENU_GATEWAY,
  UBER_MENU_PUBLICATION_REPOSITORY,
} from '../../application/ports/uber-menu-publication.ports';
import {
  type UberTelemetryPort,
  type UberWebhookInboxPort,
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from '../../application/ports/uber-order-processing.ports';
import {
  type UberOrderActionGatewayPort,
  type UberOrderActionRepositoryPort,
  type UberOrderImportRepositoryPort,
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from '../../application/ports/uber-order.ports';
import { UBER_RATE_LIMITER_PORT } from '../../application/ports/uber-rate-limiter.port';
import { UBER_ORDER_IMPORT_PORT } from '../../application/ports/uber-use-case.ports';
import { UberConfigService } from '../config/uber-config.service';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import { HmacUberWebhookSignatureVerifier } from '../crypto/uber-webhook-signature-verifier';
import { UberMenuNotificationPrismaRepository } from '../persistence/uber-menu-notification-prisma.repository';
import { UberMenuPublicationPrismaAdapter } from '../persistence/uber-menu-publication-prisma.adapter';
import { UberOrderActionPrismaAdapter } from '../persistence/uber-order-action-prisma.adapter';
import { UberOrderImportPrismaAdapter } from '../persistence/uber-order-import-prisma.adapter';
import { UberTelemetryService } from '../persistence/uber-telemetry.service';
import { UberWebhookInboxPrismaAdapter } from '../persistence/uber-webhook-inbox-prisma.adapter';
import { UberApiGatewayTransport } from '../uber-api/uber-api.gateway';
import { UberHttpClient } from '../uber-api/uber-http.client';
import { UberMenuGatewayAdapter } from '../uber-api/uber-menu-publication.adapter';
import { UberOrderActionGatewayAdapter } from '../uber-api/uber-order-action.gateway';
import { UberOrderDetailGatewayAdapter } from '../uber-api/uber-order-detail.gateway';
import { createUberRateLimiter } from '../uber-api/uber-rate-limiter.factory';
import { UberAuthService } from '../uber-api/uber-token.provider';
import { UberWorkerHealthService } from './uber-worker-health.service';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';

const WORKER_INFRASTRUCTURE_PROVIDERS = [
  {
    provide: UberConfigService,
    useFactory: () => new UberConfigService(process.env),
  },
  {
    provide: UberCredentialVaultService,
    useFactory: () => new UberCredentialVaultService(process.env),
  },
  UberTelemetryService,
  { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
  UberWebhookInboxPrismaAdapter,
  {
    provide: UBER_WEBHOOK_INBOX_PORT,
    useExisting: UberWebhookInboxPrismaAdapter,
  },
  HmacUberWebhookSignatureVerifier,
  {
    provide: UBER_WEBHOOK_SIGNATURE_VERIFIER,
    useExisting: HmacUberWebhookSignatureVerifier,
  },
  UberHttpClient,
  {
    provide: UBER_RATE_LIMITER_PORT,
    inject: [UberConfigService, UberTelemetryService],
    useFactory: (config: UberConfigService, telemetry: UberTelemetryService) =>
      createUberRateLimiter(process.env, config, telemetry),
  },
  UberAuthService,
  UberApiGatewayTransport,
];

const WORKER_APPLICATION_PROVIDERS = [
  UberOrderDetailGatewayAdapter,
  {
    provide: UBER_ORDER_DETAIL_GATEWAY,
    useExisting: UberOrderDetailGatewayAdapter,
  },
  UberOrderActionGatewayAdapter,
  {
    provide: UBER_ORDER_ACTION_COMMAND_GATEWAY,
    useExisting: UberOrderActionGatewayAdapter,
  },
  UberOrderActionPrismaAdapter,
  {
    provide: UBER_ORDER_ACTION_REPOSITORY,
    useExisting: UberOrderActionPrismaAdapter,
  },
  UberOrderImportPrismaAdapter,
  {
    provide: UBER_ORDER_IMPORT_REPOSITORY,
    useExisting: UberOrderImportPrismaAdapter,
  },
  {
    provide: UberOrderActionService,
    inject: [UBER_ORDER_ACTION_REPOSITORY, UBER_ORDER_ACTION_COMMAND_GATEWAY],
    useFactory: (
      repository: UberOrderActionRepositoryPort,
      gateway: UberOrderActionGatewayPort,
    ) => new UberOrderActionService(repository, gateway),
  },
  {
    provide: ImportUberOrderUseCase,
    inject: [
      UBER_ORDER_IMPORT_REPOSITORY,
      UBER_ORDER_DETAIL_GATEWAY,
      UberOrderActionService,
    ],
    useFactory: (
      repository: UberOrderImportRepositoryPort,
      gateway: UberOrderDetailGatewayPort,
      actions: UberOrderActionService,
    ) => new ImportUberOrderUseCase(repository, gateway, actions),
  },
  { provide: UBER_ORDER_IMPORT_PORT, useExisting: ImportUberOrderUseCase },
  {
    provide: ExecuteUberOrderActionWorker,
    inject: [UberOrderActionService],
    useFactory: (actions: UberOrderActionService) =>
      new ExecuteUberOrderActionWorker(actions),
  },
  {
    provide: ProcessUberWebhookInboxUseCase,
    inject: [
      UBER_WEBHOOK_INBOX_PORT,
      ImportUberOrderUseCase,
      UberMenuNotificationHandler,
      HandleUberMerchantWebhookHandler,
      UBER_TELEMETRY_PORT,
    ],
    useFactory: (
      inbox: UberWebhookInboxPort,
      orders: ImportUberOrderUseCase,
      menu: UberMenuNotificationHandler,
      merchant: HandleUberMerchantWebhookHandler,
      telemetry: UberTelemetryPort,
    ) =>
      new ProcessUberWebhookInboxUseCase(
        inbox,
        orders,
        menu,
        merchant,
        telemetry,
      ),
  },
  UberMenuPublicationPrismaAdapter,
  {
    provide: UBER_MENU_PUBLICATION_REPOSITORY,
    useExisting: UberMenuPublicationPrismaAdapter,
  },
  UberMenuGatewayAdapter,
  { provide: UBER_MENU_GATEWAY, useExisting: UberMenuGatewayAdapter },
  UberMenuNotificationPrismaRepository,
  {
    provide: MENU_NOTIFICATION_REPOSITORY,
    useExisting: UberMenuNotificationPrismaRepository,
  },
  {
    provide: ConfirmUberMenuPublicationUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY, UBER_MENU_GATEWAY],
    useFactory: (
      publications: UberMenuPublicationRepositoryPort,
      gateway: UberMenuGatewayPort,
    ) => new ConfirmUberMenuPublicationUseCase(publications, gateway),
  },
  {
    provide: RecoverTimedOutMenuPublicationsUseCase,
    inject: [UBER_MENU_PUBLICATION_REPOSITORY],
    useFactory: (publications: UberMenuPublicationRepositoryPort) =>
      new RecoverTimedOutMenuPublicationsUseCase(publications),
  },
  {
    provide: UberMenuNotificationHandler,
    inject: [MENU_NOTIFICATION_REPOSITORY],
    useFactory: (repository: MenuNotificationRepository) =>
      new UberMenuNotificationHandler(repository),
  },
  {
    provide: HandleUberMerchantWebhookHandler,
    inject: [UBER_WEBHOOK_INBOX_PORT, UBER_TELEMETRY_PORT],
    useFactory: (inbox: UberWebhookInboxPort, telemetry: UberTelemetryPort) =>
      new HandleUberMerchantWebhookHandler(inbox, telemetry),
  },
];

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
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  providers: [
    ...WORKER_INFRASTRUCTURE_PROVIDERS,
    ...WORKER_APPLICATION_PROVIDERS,
    ...WORKER_PROVIDERS,
  ],
  exports: [UberWorkerHealthService],
})
export class UberEatsInfrastructureWorkerModule {}
