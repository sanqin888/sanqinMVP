// apps/api/src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/membership.module';
import { PosModule } from '../pos/pos.module';

@Module({
  imports: [
    PrismaModule,
    PosModule,
    LoyaltyModule,
    DeliveriesModule,
    MembershipModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
