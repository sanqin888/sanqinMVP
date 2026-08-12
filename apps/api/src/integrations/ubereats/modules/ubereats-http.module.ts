import { Module } from '@nestjs/common';
import { UberEatsMenuController } from '../api/menu.controller';
import { UberEatsOAuthController } from '../api/oauth.controller';
import { UberEatsOperationsController } from '../api/operations.controller';
import { UberEatsOrdersController } from '../api/orders.controller';
import { UberEatsWebhookController } from '../api/webhook.controller';
import { UberEatsMenuModule } from './menu.module';
import { UberEatsMerchantModule } from './merchant.module';
import { UberEatsOperationsModule } from './operations.module';
import { UberEatsOrdersModule } from './orders.module';

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
export class UberEatsHttpModule {}
