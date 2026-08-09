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
import { UberMerchantService } from './uber-merchant.service';
import { UberOperationsService } from './uber-operations.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';

@Module({
  imports: [PrismaModule, AuthModule, MessagingModule, OrdersModule],
  controllers: [UberEatsController],
  providers: [
    {
      provide: UberConfigService,
      useFactory: () => new UberConfigService(process.env),
    },
    UberEatsService,
    UberPrismaAccessService,
    UberAuthService,
    UberHttpClient,
    UberWebhookService,
    UberOrderService,
    UberMenuService,
    UberMerchantService,
    UberOperationsService,
  ],
  exports: [
    UberAuthService,
    UberEatsService,
    UberWebhookService,
    UberOrderService,
    UberMenuService,
    UberMerchantService,
    UberOperationsService,
  ],
})
export class UberEatsModule {}
