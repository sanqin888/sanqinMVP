// apps/api/src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/membership.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notifications/notification.module';
import { EmailModule } from '../email/email.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationProcessor } from './processors/notification.processor';
import { FulfillmentProcessor } from './processors/fulfillment.processor';
import { OrderLifecycleOutboxProcessor } from './processors/order-lifecycle-outbox.processor';
import { PrintPosPayloadService } from './print-pos-payload.service';
import { OrderIngestionService } from './order-ingestion.service';

@Module({
  imports: [
    PrismaModule,
    PosDeviceModule,
    LoyaltyModule,
    DeliveriesModule,
    MembershipModule,
    LocationModule,
    NotificationModule,
    EmailModule,
    MessagingModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderIngestionService,
    PrintPosPayloadService,
    NotificationProcessor,
    FulfillmentProcessor,
    OrderLifecycleOutboxProcessor,
  ],
  exports: [OrdersService, OrderIngestionService, PrintPosPayloadService],
})
export class OrdersModule {}
