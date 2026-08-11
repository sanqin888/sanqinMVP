import { DynamicModule, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { UberAuthService } from './infrastructure/uber-api/uber-token.provider';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { BrowserWriteCsrfGuard } from './api/ubereats-csrf.guard';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { UberHttpClient } from './infrastructure/uber-api/uber-http.client';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { ProcessUberWebhookInboxUseCase } from './application/orders/process-uber-webhook-inbox.use-case';
import { ReceiveUberWebhookUseCase } from './application/orders/uber-webhook-receiver.use-case';
import { UberMenuDraftAdapter } from './infrastructure/menu/uber-menu-draft.adapter';
import { UberMenuRepository } from './infrastructure/persistence/uber-menu.repository';
import { UberOrderSyncAdapter } from './infrastructure/orders/uber-order-sync.adapter';
import { UberOrderImportPrismaAdapter } from './infrastructure/persistence/uber-order-import-prisma.adapter';
import { UberOrderDetailGatewayAdapter } from './infrastructure/uber-api/uber-order-detail.gateway';
import { UberOrderActionPrismaAdapter } from './infrastructure/persistence/uber-order-action-prisma.adapter';
import { UberOrderActionGatewayAdapter } from './infrastructure/uber-api/uber-order-action.gateway';
import { UberMenuDraftUseCase } from './application/menu/uber-menu-draft.use-case';
import { UberMenuDraftConfigUseCase } from './application/menu/uber-menu-draft-config.use-case';
import { UberMenuAvailabilityUseCase } from './application/menu/uber-menu-availability.use-case';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from './application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from './application/merchant/uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from './application/merchant/uber-merchant-provisioning.service';
import { UberOperationsPrismaAdapter } from './infrastructure/operations/uber-operations-prisma.adapter';
import {
  CreateUberOpsTicketUseCase,
  GenerateUberReconciliationReportUseCase,
  QueryUberOperationsSummary,
  RetryUberOpsTicketUseCase,
  UBER_OPERATIONS_PORT,
} from './application/operations/uber-operations.use-cases';
import { UberPrismaAccessService } from './infrastructure/persistence/uber-prisma-access.service';
import { UberOrderActionService } from './application/orders/uber-order-action.service';
import { UberOrderOutboxService } from './application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from './application/orders/uber-order-status-sync.service';
import {
  ExecuteUberOrderActionWorker,
  CancelUberOrderUseCase,
  ImportUberOrderUseCase,
  ListPendingUberOrdersQuery,
  RequestUberOrderActionUseCase,
  SyncUberOrderStatusUseCase,
} from './application/orders/uber-order.use-cases';
import { UberCredentialVaultService } from './infrastructure/crypto/uber-credential-vault.service';
import { UberApiGatewayTransport } from './infrastructure/uber-api/uber-api.gateway';
import {
  ProcessUberRateLimiter,
  UBER_RATE_LIMITER_PORT,
} from './infrastructure/uber-api/uber-rate-limiter';
import {
  UberMenuGateway,
  UberOrderGateway,
  UberStoreGateway,
  UberMerchantResourceGateway,
} from './infrastructure/uber-api/uber-resource.gateways';
import { UberTelemetryService } from './infrastructure/observability/uber-telemetry.service';
import { UBER_UNIT_OF_WORK } from './application/ports/uber-persistence.ports';
import {
  UBER_MENU_AVAILABILITY_PORT,
  UBER_MENU_DRAFT_PORT,
  UBER_ORDER_IMPORT_PORT,
  UBER_ORDER_SYNC_PORT,
} from './application/ports/uber-use-case.ports';
import {
  UBER_MENU_DRAFT_COMMAND_PORT,
  UBER_MENU_DRAFT_QUERY_PORT,
} from './application/ports/uber-menu-draft.ports';
import {
  UBER_ORDER_ACTION_GATEWAY,
  UBER_ORDER_DETAIL_GATEWAY,
} from './application/ports/uber-api.ports';
import {
  UBER_MERCHANT_API,
  UBER_OAUTH_TOKEN,
  UBER_STORE_API,
} from './application/ports/uber-api.ports';
import {
  UberMerchantApiAdapter,
  UberOAuthTokenAdapter,
} from './infrastructure/uber-api/uber-merchant-api.adapter';
import {
  UberMerchantConnectionPrismaAdapter,
  UberOAuthStatePrismaAdapter,
  UberOperationsAlertPrismaAdapter,
  UberStoreMappingPrismaAdapter,
} from './infrastructure/persistence/uber-merchant-persistence.adapter';
import {
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  UBER_OPERATIONS_ALERT_REPOSITORY,
  UBER_STORE_MAPPING_REPOSITORY,
} from './application/ports/uber-persistence.ports';
import {
  UBER_ORDER_OUTBOX_PORT,
  UBER_ORDER_STATUS_AUDIT_PORT,
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
} from './application/ports/uber-order-processing.ports';
import {
  UberOrderOutboxPrismaAdapter,
  UberOrderStatusAuditPrismaAdapter,
} from './infrastructure/persistence/uber-order-outbox-prisma.adapter';
import { UberWebhookInboxPrismaAdapter } from './infrastructure/persistence/uber-webhook-inbox-prisma.adapter';
import { HmacUberWebhookSignatureVerifier } from './infrastructure/crypto/uber-webhook-signature-verifier';
import {
  PrismaUberMenuPublishAdapter,
  PrismaUberMerchantConnectionAdapter,
  PrismaUberOAuthStateAdapter,
  PrismaUberOperationsTicketAdapter,
  PrismaUberOrderActionAdapter,
  PrismaUberStoreMappingAdapter,
  PrismaUberUnitOfWork,
  PrismaUberWebhookInboxAdapter,
} from './infrastructure/persistence/uber-prisma.adapters';
import {
  ClaimAndExecuteUberOrderActionsUseCase,
  ClaimAndProcessUberWebhookInboxUseCase,
  ConfirmUberMenuPublicationsUseCase,
} from './application/workers/uber-background-task.use-cases';
import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './infrastructure/workers/uber-worker.adapters';
import { HandleUberMerchantWebhookHandler } from './application/merchant/uber-merchant-webhook.handler';
import { PublishUberMenuUseCase } from './application/menu/publish-uber-menu.use-case';
import { ConfirmUberMenuPublicationUseCase } from './application/menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from './application/menu/recover-timed-out-menu-publications.use-case';
import {
  MENU_NOTIFICATION_REPOSITORY,
  UberMenuNotificationHandler,
} from './application/menu/uber-menu-notification.handler';
import { UberMenuNotificationPrismaRepository } from './infrastructure/persistence/uber-menu-notification-prisma.repository';
import { UberMenuSnapshotPrismaAdapter } from './infrastructure/persistence/uber-menu-snapshot-prisma.adapter';
import { UberMenuPublicationPrismaAdapter } from './infrastructure/persistence/uber-menu-publication-prisma.adapter';
import {
  UberMenuGatewayAdapter,
  UberMenuImageProbeAdapter,
} from './infrastructure/uber-api/uber-menu-publication.adapter';
import { UberImageValidator } from './infrastructure/uber-api/uber-image.validator';
import {
  UBER_MENU_GATEWAY,
  UBER_MENU_IMAGE_PROBE,
  UBER_MENU_PUBLICATION_REPOSITORY,
  UBER_MENU_PUBLISH_COMMAND,
  UBER_MENU_SNAPSHOT_REPOSITORY,
} from './application/ports/uber-menu-publication.ports';
import {
  UBER_ORDER_ACTION_COMMAND_GATEWAY,
  UBER_ORDER_ACTION_REPOSITORY,
  UBER_ORDER_IMPORT_REPOSITORY,
} from './application/ports/uber-order.ports';

@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
  providers: [
    {
      provide: UberConfigService,
      useFactory: () => new UberConfigService(process.env),
    },
    BrowserWriteCsrfGuard,
    {
      provide: UberCredentialVaultService,
      useFactory: () => new UberCredentialVaultService(process.env),
    },
    UberPrismaAccessService,
    PrismaUberWebhookInboxAdapter,
    PrismaUberOrderActionAdapter,
    PrismaUberMerchantConnectionAdapter,
    PrismaUberStoreMappingAdapter,
    PrismaUberOAuthStateAdapter,
    PrismaUberMenuPublishAdapter,
    PrismaUberOperationsTicketAdapter,
    PrismaUberUnitOfWork,
    { provide: UBER_UNIT_OF_WORK, useExisting: PrismaUberUnitOfWork },
    UberTelemetryService,
    { provide: UBER_TELEMETRY_PORT, useExisting: UberTelemetryService },
    UberOrderOutboxPrismaAdapter,
    {
      provide: UBER_ORDER_OUTBOX_PORT,
      useExisting: UberOrderOutboxPrismaAdapter,
    },
    UberOrderStatusAuditPrismaAdapter,
    {
      provide: UBER_ORDER_STATUS_AUDIT_PORT,
      useExisting: UberOrderStatusAuditPrismaAdapter,
    },
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
    UberAuthService,
    UberHttpClient,
    ProcessUberRateLimiter,
    { provide: UBER_RATE_LIMITER_PORT, useExisting: ProcessUberRateLimiter },
    UberApiGatewayTransport,
    UberMerchantResourceGateway,
    UberStoreGateway,
    UberOrderGateway,
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
    { provide: UBER_ORDER_ACTION_GATEWAY, useExisting: UberOrderGateway },
    UberMenuGateway,
    UberImageValidator,
    UberMenuSnapshotPrismaAdapter,
    {
      provide: UBER_MENU_SNAPSHOT_REPOSITORY,
      useExisting: UberMenuSnapshotPrismaAdapter,
    },
    UberMenuPublicationPrismaAdapter,
    {
      provide: UBER_MENU_PUBLICATION_REPOSITORY,
      useExisting: UberMenuPublicationPrismaAdapter,
    },
    UberMenuGatewayAdapter,
    { provide: UBER_MENU_GATEWAY, useExisting: UberMenuGatewayAdapter },
    UberMenuImageProbeAdapter,
    { provide: UBER_MENU_IMAGE_PROBE, useExisting: UberMenuImageProbeAdapter },
    ReceiveUberWebhookUseCase,
    ProcessUberWebhookInboxUseCase,
    HandleUberMerchantWebhookHandler,
    UberOrderSyncAdapter,
    UberOrderImportPrismaAdapter,
    {
      provide: UBER_ORDER_IMPORT_REPOSITORY,
      useExisting: UberOrderImportPrismaAdapter,
    },
    { provide: UBER_ORDER_SYNC_PORT, useExisting: UberOrderSyncAdapter },
    UberOrderActionService,
    UberOrderStatusSyncService,
    UberOrderOutboxService,
    ImportUberOrderUseCase,
    { provide: UBER_ORDER_IMPORT_PORT, useExisting: ImportUberOrderUseCase },
    CancelUberOrderUseCase,
    RequestUberOrderActionUseCase,
    ExecuteUberOrderActionWorker,
    SyncUberOrderStatusUseCase,
    ListPendingUberOrdersQuery,
    UberMenuDraftAdapter,
    { provide: UBER_MENU_DRAFT_PORT, useExisting: UberMenuDraftAdapter },
    {
      provide: UBER_MENU_AVAILABILITY_PORT,
      useExisting: UberMenuDraftAdapter,
    },
    UberMenuDraftUseCase,
    UberMenuRepository,
    {
      provide: UBER_MENU_DRAFT_QUERY_PORT,
      useExisting: UberMenuRepository,
    },
    {
      provide: UBER_MENU_DRAFT_COMMAND_PORT,
      useExisting: UberMenuRepository,
    },
    UberMenuDraftConfigUseCase,
    PublishUberMenuUseCase,
    { provide: UBER_MENU_PUBLISH_COMMAND, useExisting: PublishUberMenuUseCase },
    ConfirmUberMenuPublicationUseCase,
    RecoverTimedOutMenuPublicationsUseCase,
    UberMenuNotificationHandler,
    UberMenuNotificationPrismaRepository,
    {
      provide: MENU_NOTIFICATION_REPOSITORY,
      useExisting: UberMenuNotificationPrismaRepository,
    },
    UberMenuAvailabilityUseCase,
    UberOAuthTokenAdapter,
    { provide: UBER_OAUTH_TOKEN, useExisting: UberOAuthTokenAdapter },
    UberMerchantApiAdapter,
    { provide: UBER_MERCHANT_API, useExisting: UberMerchantApiAdapter },
    { provide: UBER_STORE_API, useExisting: UberMerchantApiAdapter },
    UberOAuthStatePrismaAdapter,
    {
      provide: UBER_OAUTH_STATE_REPOSITORY,
      useExisting: UberOAuthStatePrismaAdapter,
    },
    UberMerchantConnectionPrismaAdapter,
    {
      provide: UBER_MERCHANT_CONNECTION_REPOSITORY,
      useExisting: UberMerchantConnectionPrismaAdapter,
    },
    UberStoreMappingPrismaAdapter,
    {
      provide: UBER_STORE_MAPPING_REPOSITORY,
      useExisting: UberStoreMappingPrismaAdapter,
    },
    UberOperationsAlertPrismaAdapter,
    {
      provide: UBER_OPERATIONS_ALERT_REPOSITORY,
      useExisting: UberOperationsAlertPrismaAdapter,
    },
    StartUberOAuthUseCase,
    CompleteUberOAuthUseCase,
    DiscoverUberStoresUseCase,
    MapUberStoreUseCase,
    ProvisionUberStoreUseCase,
    DeprovisionUberStoreUseCase,
    SyncUberStoreStatusUseCase,
    UberOperationsPrismaAdapter,
    { provide: UBER_OPERATIONS_PORT, useExisting: UberOperationsPrismaAdapter },
    GenerateUberReconciliationReportUseCase,
    CreateUberOpsTicketUseCase,
    RetryUberOpsTicketUseCase,
    QueryUberOperationsSummary,
  ],
  exports: [
    UberAuthService,
    BrowserWriteCsrfGuard,
    ReceiveUberWebhookUseCase,
    RequestUberOrderActionUseCase,
    SyncUberOrderStatusUseCase,
    ListPendingUberOrdersQuery,
    UberMenuDraftUseCase,
    UberMenuDraftConfigUseCase,
    PublishUberMenuUseCase,
    UberMenuAvailabilityUseCase,
    StartUberOAuthUseCase,
    CompleteUberOAuthUseCase,
    DiscoverUberStoresUseCase,
    MapUberStoreUseCase,
    ProvisionUberStoreUseCase,
    DeprovisionUberStoreUseCase,
    SyncUberStoreStatusUseCase,
    GenerateUberReconciliationReportUseCase,
    CreateUberOpsTicketUseCase,
    RetryUberOpsTicketUseCase,
    QueryUberOperationsSummary,
  ],
})
export class UberEatsModule {
  /** Explicit opt-in boundary used by a dedicated application context. */
  static withWorkers(): DynamicModule {
    return {
      module: UberEatsModule,
      providers: [
        ClaimAndProcessUberWebhookInboxUseCase,
        ClaimAndExecuteUberOrderActionsUseCase,
        ConfirmUberMenuPublicationsUseCase,
        UberWebhookInboxWorkerAdapter,
        UberOrderActionWorkerAdapter,
        UberMenuPublishConfirmationWorkerAdapter,
      ],
    };
  }
}
