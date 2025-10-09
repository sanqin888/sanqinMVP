import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
// 还有 LoyaltyModule 等按你项目实际

@Module({
  imports: [PrismaModule, OrdersModule, ReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
