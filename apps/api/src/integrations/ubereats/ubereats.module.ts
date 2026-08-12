import { Module } from '@nestjs/common';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { UberEatsMenuModule } from './modules/menu.module';
import { UberEatsMerchantModule } from './modules/merchant.module';
import { UberEatsOperationsModule } from './modules/operations.module';
import { UberEatsOrdersModule } from './modules/orders.module';

/** API-process composition root. Polling is enabled only by the worker module. */
@Module({
  imports: [
    UberEatsMerchantModule,
    UberEatsOrdersModule,
    UberEatsMenuModule,
    UberEatsOperationsModule,
  ],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
})
export class UberEatsModule {}
