import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CloverModule } from './clover/clover.module';
import { CloverWebhooksModule } from './clover/clover-webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      expandVariables: true,
    }),
    PrismaModule,
    OrdersModule,
    ReportsModule,
    LoyaltyModule,
    CloverModule,
    CloverWebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
