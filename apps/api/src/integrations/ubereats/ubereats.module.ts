import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { UberAuthService } from './uber-auth.service';
import { UberEatsController } from './ubereats.controller';
import { UberEatsService } from './ubereats.service';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { UberHttpClient } from './uber-http.client';
import { UberConfigService } from './uber-config.service';
import { UberWebhookService } from './uber-webhook.service';
import { UberOrderService } from './uber-order.service';
import { UberMenuService } from './uber-menu.service';
import { UberMenuWorkflowCore } from './uber-menu.workflow';
import { UberMenuDraftService } from './uber-menu-draft.service';
import { UberMenuPublishService } from './uber-menu-publish.service';
import { UberMenuAvailabilityService } from './uber-menu-availability.service';
import { UberMerchantService } from './uber-merchant.service';
import { UberMerchantInternalService } from './uber-merchant-internal.service';
import { UberMerchantOAuthService } from './uber-merchant-oauth.service';
import { UberMerchantStoreMappingService } from './uber-merchant-store-mapping.service';
import { UberMerchantProvisioningService } from './uber-merchant-provisioning.service';
import { UberOperationsService } from './uber-operations.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { UberOrderActionService } from './uber-order-action.service';
import { UberOrderOutboxService } from './uber-order-outbox.service';
import { UberOrderStatusSyncService } from './uber-order-status-sync.service';
import { UberCredentialVaultService } from '../../infrastructure/crypto/uber-credential-vault.service';

@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [UberEatsController],
  providers: [
    {
      provide: UberConfigService,
      useFactory: () => new UberConfigService(process.env),
    },
    UberEatsService,
    UberCredentialVaultService,
    UberPrismaAccessService,
    UberAuthService,
    UberHttpClient,
    UberWebhookService,
    UberOrderService,
    UberOrderActionService,
    UberOrderStatusSyncService,
    UberOrderOutboxService,
    UberMenuWorkflowCore,
    UberMenuDraftService,
    UberMenuPublishService,
    UberMenuAvailabilityService,
    UberMenuService,
    UberMerchantInternalService,
    UberMerchantOAuthService,
    UberMerchantStoreMappingService,
    UberMerchantProvisioningService,
    UberMerchantService,
    UberOperationsService,
  ],
  exports: [
    UberAuthService,
    UberEatsService,
    UberWebhookService,
    UberOrderService,
    UberMenuService,
    UberMerchantInternalService,
    UberMerchantOAuthService,
    UberMerchantStoreMappingService,
    UberMerchantProvisioningService,
    UberMerchantService,
    UberOperationsService,
  ],
})
export class UberEatsModule {}
