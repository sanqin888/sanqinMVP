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
import { UberOrderApplication } from './application/orders/uber-order.service';
import { UberMenuService } from './application/menu/uber-menu.service';
import { UberMenuPrismaAdapter } from './infrastructure/persistence/uber-menu-prisma.adapter';
import { UberOrderPrismaAdapter } from './infrastructure/persistence/uber-order-prisma.adapter';
import { UberMenuDraftService } from './application/menu/uber-menu-draft.service';
import { UberMenuPublishService } from './application/menu/uber-menu-publish.service';
import { UberMenuAvailabilityService } from './application/menu/uber-menu-availability.service';
import { UberMerchantService } from './application/merchant/uber-merchant.service';
import { UberMerchantGateway } from './infrastructure/uber-api/uber-merchant.gateway';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
  UberMerchantOAuthService,
} from './application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
  UberMerchantStoreMappingService,
} from './application/merchant/uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
  UberMerchantProvisioningService,
} from './application/merchant/uber-merchant-provisioning.service';
import {
  UberMerchantConnectionRepository,
  UberOAuthStateRepository,
  UberStoreMappingRepository,
  UberMerchantWorkflowRepository,
} from './infrastructure/persistence/uber-merchant.repositories';
import { UberOperationsApplication } from './application/operations/uber-operations.service';
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
  UberMenuGateway,
  UberOrderGateway,
  UberStoreGateway,
  UberMerchantGateway as UberMerchantApiGateway,
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
  PrismaUberMenuPublishAdapter,
  PrismaUberMerchantConnectionAdapter,
  PrismaUberOAuthStateAdapter,
  PrismaUberOperationsTicketAdapter,
  PrismaUberOrderActionAdapter,
  PrismaUberStoreMappingAdapter,
  PrismaUberUnitOfWork,
  PrismaUberWebhookInboxAdapter,
} from './infrastructure/persistence/uber-prisma.adapters';

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
    UberAuthService,
    UberHttpClient,
    UberApiGatewayTransport,
    UberMerchantApiGateway,
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
    UberOrderApplication,
    UberOrderActionService,
    UberOrderStatusSyncService,
    UberOrderOutboxService,
    ImportUberOrderUseCase,
    CancelUberOrderUseCase,
    RequestUberOrderActionUseCase,
    ExecuteUberOrderActionWorker,
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
    UberMenuService,
    UberMerchantGateway,
    UberMerchantConnectionRepository,
    UberMerchantWorkflowRepository,
    UberStoreMappingRepository,
    UberOAuthStateRepository,
    StartUberOAuthUseCase,
    CompleteUberOAuthUseCase,
    DiscoverUberStoresUseCase,
    MapUberStoreUseCase,
    ProvisionUberStoreUseCase,
    DeprovisionUberStoreUseCase,
    SyncUberStoreStatusUseCase,
    UberMerchantOAuthService,
    UberMerchantStoreMappingService,
    UberMerchantProvisioningService,
    UberMerchantService,
    UberOperationsPrismaAdapter,
    { provide: UBER_OPERATIONS_PORT, useExisting: UberOperationsPrismaAdapter },
    GenerateUberReconciliationReportUseCase,
    CreateUberOpsTicketUseCase,
    RetryUberOpsTicketUseCase,
    QueryUberOperationsSummary,
    UberOperationsApplication,
  ],
  exports: [
    UberAuthService,
    BrowserWriteCsrfGuard,
    ReceiveUberWebhookUseCase,
    ReceiveUberWebhookUseCase,
    UberOrderApplication,
    UberMenuService,
    UberMerchantOAuthService,
    UberMerchantStoreMappingService,
    UberMerchantProvisioningService,
    UberMerchantService,
    UberOperationsApplication,
  ],
})
export class UberEatsModule {}
