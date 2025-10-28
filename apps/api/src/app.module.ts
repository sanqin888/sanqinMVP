import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, type ConfigModuleOptions } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CloverModule } from './clover/clover.module';
import { CloverWebhooksModule } from './clover/clover-webhooks.module';

const configModuleFactory: {
  forRoot(options: ConfigModuleOptions): DynamicModule;
} = ConfigModule as unknown as {
  forRoot(options: ConfigModuleOptions): DynamicModule;
};

const envConfigModule = configModuleFactory.forRoot({
  isGlobal: true,
  envFilePath: ['apps/api/.env', '.env'],
  expandVariables: true,
});

@Module({
  imports: [
    envConfigModule,
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
