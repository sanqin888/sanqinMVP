import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MessagingModule } from '../../messaging/messaging.module';
import { OrdersModule } from '../../orders/orders.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { UberEatsMenuController } from './api/menu.controller';
import { UberEatsOAuthController } from './api/oauth.controller';
import { UberEatsOperationsController } from './api/operations.controller';
import { UberEatsOrdersController } from './api/orders.controller';
import { UberEatsWebhookController } from './api/webhook.controller';
import { UBER_EATS_INFRASTRUCTURE_PROVIDERS } from './providers/infrastructure.providers';
import {
  UBER_EATS_MENU_EXPORTS,
  UBER_EATS_MENU_PROVIDERS,
} from './providers/menu.providers';
import {
  UBER_EATS_MERCHANT_EXPORTS,
  UBER_EATS_MERCHANT_PROVIDERS,
} from './providers/merchant.providers';
import {
  UBER_EATS_OPERATIONS_EXPORTS,
  UBER_EATS_OPERATIONS_PROVIDERS,
} from './providers/operations.providers';
import {
  UBER_EATS_ORDER_EXPORTS,
  UBER_EATS_ORDER_PROVIDERS,
} from './providers/orders.providers';

/** Thin API-process composition root. Polling is enabled only by the worker module. */
@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  providers: [
    ...UBER_EATS_INFRASTRUCTURE_PROVIDERS,
    ...UBER_EATS_MERCHANT_PROVIDERS,
    ...UBER_EATS_MENU_PROVIDERS,
    ...UBER_EATS_ORDER_PROVIDERS,
    ...UBER_EATS_OPERATIONS_PROVIDERS,
  ],
  controllers: [
    UberEatsOAuthController,
    UberEatsWebhookController,
    UberEatsOrdersController,
    UberEatsMenuController,
    UberEatsOperationsController,
  ],
  exports: [
    ...UBER_EATS_MERCHANT_EXPORTS,
    ...UBER_EATS_MENU_EXPORTS,
    ...UBER_EATS_ORDER_EXPORTS,
    ...UBER_EATS_OPERATIONS_EXPORTS,
  ],
})
export class UberEatsModule {}
