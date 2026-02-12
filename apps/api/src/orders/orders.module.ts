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
import { OrderEventListener } from './listeners/order-event.listener';

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
  providers: [OrdersService, OrderEventListener],
  exports: [OrdersService],
})
export class OrdersModule {}
