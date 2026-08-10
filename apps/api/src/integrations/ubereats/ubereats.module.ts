import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { UberAuthService } from './application/merchant/uber-auth.service';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { BrowserWriteCsrfGuard } from './api/ubereats-csrf.guard';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { UberHttpClient } from './infrastructure/http/uber-http.client';
import { UberConfigService } from './infrastructure/config/uber-config.service';
import { UberWebhookService } from './application/orders/uber-webhook.service';
import { UberOrderService } from './application/orders/uber-order.service';
import { UberMenuService } from './application/menu/uber-menu.service';
import { UberMenuWorkflowCore } from './application/menu/uber-menu.workflow';
import { UberMenuDraftService } from './application/menu/uber-menu-draft.service';
import { UberMenuPublishService } from './application/menu/uber-menu-publish.service';
import { UberMenuAvailabilityService } from './application/menu/uber-menu-availability.service';
import { UberMerchantService } from './application/merchant/uber-merchant.service';
import { UberMerchantGateway } from './infrastructure/api/uber-merchant.gateway';
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
} from './infrastructure/persistence/uber-merchant.repositories';
import { UberOperationsService } from './application/operations/uber-operations.service';
import { UberPrismaAccessService } from './infrastructure/persistence/uber-prisma-access.service';
import { UberOrderActionService } from './application/orders/uber-order-action.service';
import { UberOrderOutboxService } from './application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from './application/orders/uber-order-status-sync.service';
import {
  ExecuteUberOrderActionWorker,
  HandleUberOrderCancellationUseCase,
  ImportUberOrderUseCase,
  PersistUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './application/orders/uber-order.use-cases';
import { UberCredentialVaultService } from './infrastructure/crypto/uber-credential-vault.service';
import { UberApiGatewayTransport } from './infrastructure/api/uber-api.gateway';
import {
  UberMenuGateway,
  UberOrderGateway,
  UberStoreGateway,
  UberMerchantGateway as UberMerchantApiGateway,
} from './infrastructure/api/uber-resource.gateways';
import { UberTelemetryService } from './infrastructure/observability/uber-telemetry.service';

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
    UberCredentialVaultService,
    UberPrismaAccessService,
    UberTelemetryService,
    UberAuthService,
    UberHttpClient,
    UberApiGatewayTransport,
    UberMerchantApiGateway,
    UberStoreGateway,
    UberOrderGateway,
    UberMenuGateway,
    UberWebhookService,
    UberOrderService,
    UberOrderActionService,
    UberOrderStatusSyncService,
    UberOrderOutboxService,
    ImportUberOrderUseCase,
    PersistUberOrderUseCase,
    HandleUberOrderCancellationUseCase,
    RequestUberOrderActionUseCase,
    ExecuteUberOrderActionWorker,
    UberMenuWorkflowCore,
    UberMenuDraftService,
    UberMenuPublishService,
    UberMenuAvailabilityService,
    UberMenuService,
    UberMerchantGateway,
    UberMerchantConnectionRepository,
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
    UberOperationsService,
  ],
  exports: [
    UberAuthService,
    BrowserWriteCsrfGuard,
    UberWebhookService,
    UberOrderService,
    UberMenuService,
    UberMerchantOAuthService,
    UberMerchantStoreMappingService,
    UberMerchantProvisioningService,
    UberMerchantService,
    UberOperationsService,
  ],
})
export class UberEatsModule {}
