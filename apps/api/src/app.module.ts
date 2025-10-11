import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';

@Module({
  imports: [PrismaModule, OrdersModule, ReportsModule, LoyaltyModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
