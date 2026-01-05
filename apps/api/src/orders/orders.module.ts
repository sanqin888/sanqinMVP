// apps/api/src/orders/orders.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { MembershipModule } from '../membership/membership.module';
import { PosDeviceModule } from '../pos/pos-device.module'; // 修改引入

@Module({
  imports: [
    PrismaModule,
    PosDeviceModule, // ✅ 只引入设备验证模块，解耦了业务逻辑
    LoyaltyModule,
    DeliveriesModule,
    MembershipModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
