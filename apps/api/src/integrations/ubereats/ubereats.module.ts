import { Module } from '@nestjs/common';
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
import { ProcessUberWebhookInboxWorker } from './application/orders/uber-webhook-inbox.worker';
import { ReceiveUberWebhookUseCase } from './application/orders/uber-webhook-receiver.use-case';
import { UberMenuPrismaAdapter } from './infrastructure/persistence/uber-menu-prisma.adapter';
import { UberOrderPrismaAdapter } from './infrastructure/persistence/uber-order-prisma.adapter';
import { UberMenuDraftService } from './application/menu/uber-menu-draft.service';
import { UberMenuPublishService } from './application/menu/uber-menu-publish.service';
import { UberMenuAvailabilityService } from './application/menu/uber-menu-availability.service';
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
import { UberOperationsPrismaAdapter } from './infrastructure/persistence/uber-operations-prisma.adapter';
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
  UBER_MENU_PUBLISH_PORT,
  UBER_ORDER_ACTION_PORT,
  UBER_ORDER_IMPORT_PORT,
  UBER_ORDER_SYNC_PORT,
  UBER_WEBHOOK_INBOX_RECEIVER_PORT,
} from './application/ports/uber-use-case.ports';
import { UBER_ORDER_ACTION_GATEWAY } from './application/ports/uber-api.ports';
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
    { provide: UBER_ORDER_ACTION_GATEWAY, useExisting: UberOrderGateway },
    UberMenuGateway,
    ProcessUberWebhookInboxWorker,
    {
      provide: UBER_WEBHOOK_INBOX_RECEIVER_PORT,
      useExisting: ProcessUberWebhookInboxWorker,
    },
    ReceiveUberWebhookUseCase,
    UberOrderPrismaAdapter,
    { provide: UBER_ORDER_IMPORT_PORT, useExisting: UberOrderPrismaAdapter },
    { provide: UBER_ORDER_ACTION_PORT, useExisting: UberOrderPrismaAdapter },
    { provide: UBER_ORDER_SYNC_PORT, useExisting: UberOrderPrismaAdapter },
    UberOrderActionService,
    UberOrderStatusSyncService,
    UberOrderOutboxService,
    ImportUberOrderUseCase,
    CancelUberOrderUseCase,
    RequestUberOrderActionUseCase,
    ExecuteUberOrderActionWorker,
    ClaimAndProcessUberWebhookInboxUseCase,
    ClaimAndExecuteUberOrderActionsUseCase,
    ConfirmUberMenuPublicationsUseCase,
    UberWebhookInboxWorkerAdapter,
    UberOrderActionWorkerAdapter,
    UberMenuPublishConfirmationWorkerAdapter,
    SyncUberOrderStatusUseCase,
    ListPendingUberOrdersQuery,
    UberMenuPrismaAdapter,
    { provide: UBER_MENU_DRAFT_PORT, useExisting: UberMenuPrismaAdapter },
    { provide: UBER_MENU_PUBLISH_PORT, useExisting: UberMenuPrismaAdapter },
    {
      provide: UBER_MENU_AVAILABILITY_PORT,
      useExisting: UberMenuPrismaAdapter,
    },
    UberMenuDraftService,
    UberMenuPublishService,
    UberMenuAvailabilityService,
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
    UberMenuDraftService,
    UberMenuPublishService,
    UberMenuAvailabilityService,
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
export class UberEatsModule {}
