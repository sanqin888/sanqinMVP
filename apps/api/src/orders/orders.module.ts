import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [PrismaModule, LoyaltyModule, DeliveriesModule, MembershipModule], // 🔑 引入提供所需服务的模块
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
